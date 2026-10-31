import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import {
  CH,
  favoriteRequestSchema,
  gamesRequestSchema,
  launchRequestSchema,
  PAD_ACTIONS,
  scanRequestSchema,
  settingsSchema,
  type ControlsPayload,
  type EngineControls,
  type EngineControlsView,
  type FirmwareState,
  type GameRecord,
  type HomePayload,
  type KeyboardBindings,
  type LaunchResult,
  type PadAction,
  type ScanResult,
  type SystemView,
} from '../shared/contract';
import { FAMILIES, systemsOf, systemById, type SystemId } from '../shared/systems';
import {
  applyEngineControls,
  CONTROL_ENGINE_IDS,
  defaultBindings,
  isControlsSupported,
  readEngineControls,
  readEngineMode,
  type ControlPaths,
} from './controls';
import { EngineRegistry, buildArgs } from './engines';
import {
  applyCemuLaunchOptions,
  cemuKeysPath,
  copyCemuKeys,
  countCemuKeys,
  isValidWiiuMlc,
} from './cemu';
import {
  findWiiMenuWad,
  hostKeysSpec,
  libretroAvailability,
  libretroShotDir,
  stageLibretroRuntime,
  type LibretroPaths,
} from './libretro';
import { scanFolder } from './scanner';
import { Store } from './store';
import { Supervisor } from './supervisor';

export interface Services {
  store: Store;
  engines: EngineRegistry;
  supervisor: Supervisor;
}

export function enginesDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'engines')
    : path.join(app.getAppPath(), 'resources', 'engines');
}

export function coversDir(): string {
  return path.join(app.getPath('userData'), 'covers');
}

/** mGBA writes its screenshots here (redirected via -C screenshotPath). */
export function shotsDir(): string {
  return path.join(app.getPath('userData'), 'shots');
}

/** All Dolphin state (NAND, memcards, config) lives under this one folder. */
function dolphinUserDir(): string {
  return path.join(app.getPath('userData'), 'dolphin');
}

/** Folders the libretro host/core need, resolved for dev and packaged builds. */
function libretroPaths(): LibretroPaths {
  const resources = app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources');
  return {
    toolsDir: path.join(resources, 'tools'),
    enginesDir: enginesDir(),
    userData: app.getPath('userData'),
  };
}

/**
 * Which engine actually launched a session. System mode can deviate from
 * `systems.ts` (libretro host instead of Dolphin Qt), and the cover pipeline has
 * to know that; `index.ts` reads this map on launch events.
 */
const sessionEngines = new Map<string, string>();

export function engineIdForSession(sessionId: string): string | undefined {
  return sessionEngines.get(sessionId);
}

export function forgetSessionEngine(sessionId: string): void {
  sessionEngines.delete(sessionId);
}

/** Clear frames from a previous session so a stale shot never becomes the cover. */
function resetLibretroShots(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      if (!name.toLowerCase().endsWith('.png')) continue;
      try {
        unlinkSync(path.join(dir, name));
      } catch {
        /* a locked stale frame is harmless, it just loses the mtime race */
      }
    }
  } catch {
    /* the directory may not exist yet */
  }
}

interface DolphinIpl {
  /** Menu label used by Dolphin's own "Load GameCube Main Menu" submenu. */
  item: 'NTSC-U' | 'NTSC-J' | 'PAL';
  file: string;
}

/**
 * Dolphin refuses to boot when the *disc region's* IPL is missing. NGC system
 * mode needs the real menu, so only offer it when a matching IPL is present.
 */
function findDolphinIpl(): DolphinIpl | null {
  const candidates: Array<[DolphinIpl['item'], string]> = [
    ['NTSC-U', 'USA'],
    ['NTSC-J', 'JAP'],
    ['PAL', 'EUR'],
  ];
  for (const [item, folder] of candidates) {
    const file = path.join(dolphinUserDir(), 'GC', folder, 'IPL.bin');
    if (existsSync(file)) return { item, file };
  }
  return null;
}

/* ------------------------------------------------------------- firmware */

/** CRC32 of the IPL files Dolphin accepts (values come from its Boot.cpp). */
const GC_IPL_CRCS: Record<number, { folder: 'USA' | 'JAP' | 'EUR'; label: string }> = {
  0x6dac1f2a: { folder: 'USA', label: 'NTSC v1.0' },
  0xd5e6feea: { folder: 'USA', label: 'NTSC v1.1' },
  0xd235e3f9: { folder: 'USA', label: 'NTSC v1.2 (DOL-001)' },
  0x86573808: { folder: 'USA', label: 'NTSC v1.2 (DOL-101)' },
  0x667d0b64: { folder: 'USA', label: 'MPAL v1.1 (Brazil)' },
  0x4f319f43: { folder: 'EUR', label: 'PAL v1.0' },
  0xad1b7f16: { folder: 'EUR', label: 'PAL v1.2' },
};

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function wiiMenuWadPath(): string {
  return path.join(dolphinUserDir(), 'wii-menu.wad');
}

/* ------------------------------------------------------------- melonDS */

/** DS firmware menu needs real dumps; melonDS' FreeBIOS cannot boot it. */
function ndsBiosDir(): string {
  return path.join(app.getPath('userData'), 'melonds', 'bios');
}

function ndsBiosFiles(): { bios7: string; bios9: string; firmware: string } | null {
  const dir = ndsBiosDir();
  const bios7 = path.join(dir, 'bios7.bin');
  const bios9 = path.join(dir, 'bios9.bin');
  const firmware = path.join(dir, 'firmware.bin');
  if (!existsSync(bios7) || !existsSync(bios9) || !existsSync(firmware)) return null;
  return { bios7, bios9, firmware };
}

/**
 * melonDS 1.1 stores its settings in `melonDS.toml` next to the executable.
 * Nest only manages the few keys it needs: external BIOS (so the real firmware
 * menu can boot) and the paths to the user's dumps.
 */
function ensureMelondsConfig(systemMode: boolean): boolean {
  const configPath = path.join(enginesDir(), 'melonds', 'melonDS.toml');
  const bios = ndsBiosFiles();
  if (systemMode && !bios) return false;

  const managed: Array<[string, string, string]> = [
    ['Emu', 'ConsoleType', '0'],
    ['Emu', 'ExternalBIOSEnable', systemMode ? 'true' : 'false'],
    ['Emu', 'DirectBoot', systemMode ? 'false' : 'true'],
  ];
  if (bios) {
    const posix = (value: string) => value.replace(/\\/g, '/');
    managed.push(['DS', 'BIOS7Path', `"${posix(bios.bios7)}"`]);
    managed.push(['DS', 'BIOS9Path', `"${posix(bios.bios9)}"`]);
    managed.push(['DS', 'FirmwarePath', `"${posix(bios.firmware)}"`]);
  }

  let lines: string[] = [];
  try {
    lines = readFileSync(configPath, 'utf8').split(/\r?\n/);
  } catch {
    lines = [];
  }

  for (const [section, key, value] of managed) {
    const header = `[${section}]`;
    let sectionIndex = lines.indexOf(header);
    if (sectionIndex < 0) {
      lines.push(header);
      sectionIndex = lines.length - 1;
    }
    let end = lines.length;
    for (let i = sectionIndex + 1; i < lines.length; i += 1) {
      if (lines[i].startsWith('[')) {
        end = i;
        break;
      }
    }
    const keyLine = `${key} = ${value}`;
    let replaced = false;
    for (let i = sectionIndex + 1; i < end; i += 1) {
      if (lines[i].startsWith(`${key} `) || lines[i].startsWith(`${key}=`)) {
        lines[i] = keyLine;
        replaced = true;
        break;
      }
    }
    if (!replaced) lines.splice(end, 0, keyLine);
  }

  try {
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${lines.join('\n')}\n`, 'utf8');
  } catch {
    return false;
  }
  return true;
}

function firmwareStates(services: Services): FirmwareState[] {
  const states: FirmwareState[] = [];

  const ipl = findDolphinIpl();
  if (!ipl) {
    states.push({ kind: 'gc-ipl', label: 'GameCube IPL（系统菜单）', status: 'missing', path: null });
  } else {
    let status: FirmwareState['status'] = 'invalid';
    let detail = '未识别的 IPL';
    try {
      const crc = crc32(readFileSync(ipl.file));
      const known = GC_IPL_CRCS[crc];
      if (known) {
        status = 'ok';
        detail = `${known.label} · CRC32 ${crc.toString(16).padStart(8, '0')}`;
      } else {
        detail = `不是已知转储 · CRC32 ${crc.toString(16).padStart(8, '0')}`;
      }
    } catch {
      detail = '无法读取';
    }
    states.push({ kind: 'gc-ipl', label: 'GameCube IPL（系统菜单）', status, path: ipl.file, detail });
  }

  const wad = wiiMenuWadPath();
  if (existsSync(wad)) {
    const size = statSync(wad).size;
    const ok = size > 1_000_000;
    states.push({
      kind: 'wii-menu',
      label: 'Wii 系统菜单 WAD',
      status: ok ? 'ok' : 'invalid',
      path: wad,
      detail: ok ? `${(size / 1024 / 1024).toFixed(1)} MB` : '文件过小，可能不完整',
    });
  } else {
    states.push({ kind: 'wii-menu', label: 'Wii 系统菜单 WAD', status: 'missing', path: null });
  }

  const nds = ndsBiosFiles();
  if (nds) {
    states.push({
      kind: 'nds-bios',
      label: 'NDS BIOS + 固件（固件菜单）',
      status: 'ok',
      path: ndsBiosDir(),
      detail: `bios7 / bios9 / firmware 就绪`,
    });
  } else {
    states.push({
      kind: 'nds-bios',
      label: 'NDS BIOS + 固件（固件菜单）',
      status: 'missing',
      path: null,
    });
  }

  const keysPath = cemuKeysPath(enginesDir());
  if (existsSync(keysPath)) {
    const keyCount = countCemuKeys(readFileSync(keysPath, 'utf8'));
    states.push({
      kind: 'cemu-keys',
      label: 'Cemu keys.txt（Wii U 解密密钥）',
      status: keyCount > 0 ? 'ok' : 'invalid',
      path: keysPath,
      detail: keyCount > 0 ? `${keyCount} 个有效密钥` : '没有 32 位十六进制 key 行',
    });
  } else {
    states.push({
      kind: 'cemu-keys',
      label: 'Cemu keys.txt（Wii U 解密密钥）',
      status: 'missing',
      path: null,
      detail: '未导入',
    });
  }

  const mlc = services.store.getSettings().cemuMlc ?? null;
  if (mlc && isValidWiiuMlc(mlc)) {
    states.push({
      kind: 'wiiu-mlc',
      label: 'Wii U NAND（MLC 目录）',
      status: 'ok',
      path: mlc,
      detail: `${mlc} · Wii U Menu title / usr 就绪`,
    });
  } else if (mlc) {
    states.push({
      kind: 'wiiu-mlc',
      label: 'Wii U NAND（MLC 目录）',
      status: 'invalid',
      path: mlc,
      detail: `${mlc} · 缺少 sys/title/00050010/10040000 或 usr/`,
    });
  } else {
    states.push({
      kind: 'wiiu-mlc',
      label: 'Wii U NAND（MLC 目录）',
      status: 'missing',
      path: null,
      detail: '未设置（只记录路径，不复制 NAND）',
    });
  }

  return states;
}

/**
 * Lets the user point Nest at firmware they dumped themselves. Nothing here is
 * bundled or downloaded: the file is copied into Nest's own data folder so the
 * engine can find it, and the CRC decides which region folder an IPL belongs to.
 */
async function pickFirmware(services: Services, raw: unknown): Promise<{
  ok: boolean;
  canceled?: boolean;
  error?: string;
  state?: FirmwareState;
}> {
  const kind = (raw as { kind?: unknown })?.kind;
  if (
    kind !== 'gc-ipl' &&
    kind !== 'wii-menu' &&
    kind !== 'nds-bios' &&
    kind !== 'cemu-keys' &&
    kind !== 'wiiu-mlc'
  ) {
    return { ok: false, error: 'bad-request' };
  }

  if (kind === 'cemu-keys') {
    const picked = await dialog.showOpenDialog({
      title: '选择 Cemu keys.txt',
      properties: ['openFile'],
      filters: [{ name: 'Cemu keys', extensions: ['txt'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: true, canceled: true };
    const result = copyCemuKeys(picked.filePaths[0], cemuKeysPath(enginesDir()));
    if (!result.ok) {
      return { ok: false, error: result.error === 'io-error' ? 'keys-io-error' : 'missing-cemu-keys' };
    }
    console.log(`[nest] cemu keys imported: ${result.keys} valid line(s) -> ${result.path}`);
    return { ok: true, state: firmwareStates(services).find((state) => state.kind === kind) };
  }

  if (kind === 'wiiu-mlc') {
    const picked = await dialog.showOpenDialog({
      title: '选择 Wii U NAND / MLC 目录',
      properties: ['openDirectory'],
    });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: true, canceled: true };
    const dir = path.normalize(picked.filePaths[0]);
    if (!isValidWiiuMlc(dir)) return { ok: false, error: 'invalid-wiiu-mlc' };
    await services.store.setSettings({ cemuMlc: dir });
    console.log(`[nest] wiiu mlc set: ${dir}`);
    return { ok: true, state: firmwareStates(services).find((state) => state.kind === kind) };
  }

  if (kind === 'nds-bios') {
    // NDS firmware is a set of three files, so pick the folder instead of a file.
    const folder = await dialog.showOpenDialog({
      title: '选择包含 bios7.bin / bios9.bin / firmware.bin 的文件夹',
      properties: ['openDirectory'],
    });
    if (folder.canceled || folder.filePaths.length === 0) return { ok: true, canceled: true };
    const sourceDir = folder.filePaths[0];
    try {
      const wanted: Array<[string, string]> = [
        ['bios7.bin', 'bios7.bin'],
        ['bios9.bin', 'bios9.bin'],
        ['firmware.bin', 'firmware.bin'],
      ];
      const entries = readdirSync(sourceDir);
      const targetDir = ndsBiosDir();
      mkdirSync(targetDir, { recursive: true });
      for (const [name, dest] of wanted) {
        const found = entries.find((entry) => entry.toLowerCase() === name);
        if (!found) return { ok: false, error: `missing-${name}` };
        writeFileSync(path.join(targetDir, dest), readFileSync(path.join(sourceDir, found)));
      }
      ensureMelondsConfig(false);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
    return { ok: true, state: firmwareStates(services).find((state) => state.kind === kind) };
  }

  const picked = await dialog.showOpenDialog({
    title: kind === 'gc-ipl' ? '选择 GameCube IPL（ipl.bin）' : '选择 Wii 系统菜单 WAD',
    properties: ['openFile'],
    filters:
      kind === 'gc-ipl'
        ? [{ name: 'IPL', extensions: ['bin'] }]
        : [{ name: 'WAD', extensions: ['wad'] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) return { ok: true, canceled: true };

  const source = picked.filePaths[0];
  try {
    if (kind === 'gc-ipl') {
      const buffer = readFileSync(source);
      const crc = crc32(buffer);
      const known = GC_IPL_CRCS[crc];
      if (!known) {
        return { ok: false, error: 'ipl-not-recognized' };
      }
      const target = path.join(dolphinUserDir(), 'GC', known.folder, 'IPL.bin');
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, buffer);
    } else {
      const target = wiiMenuWadPath();
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(source));
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  return { ok: true, state: firmwareStates(services).find((state) => state.kind === kind) };
}

/** Attaches the saved cover as a data URL, so the renderer needs no protocol handler. */
function withCover(record: GameRecord): GameRecord {
  if (!record.cover) return record;
  try {
    const image = nativeImage.createFromPath(path.join(coversDir(), record.cover));
    if (image.isEmpty()) return record;
    return { ...record, coverUrl: image.toDataURL() };
  } catch {
    return record;
  }
}

/* ------------------------------------------------------------ scan roots */

const MAX_SCAN_ROOTS = 32;

/** Adds a folder to the auto-scan list, keeping it absolute and deduplicated. */
async function rememberScanRoot(store: Store, root: string): Promise<void> {
  const resolved = path.resolve(root);
  const current = store.getSettings().scanRoots ?? [];
  if (current.includes(resolved)) return;
  await store.setSettings({ scanRoots: [...current, resolved].slice(-MAX_SCAN_ROOTS) });
}

/**
 * Re-scans every remembered folder. Used both by the settings panel button and
 * by the silent scan at startup, so a user who adds a folder once never has to
 * touch it again.
 */
export async function rescanRoots(
  store: Store,
): Promise<{ roots: string[]; added: number; skipped: number; total: number }> {
  const roots = (store.getSettings().scanRoots ?? []).filter((root) => {
    try {
      return existsSync(root);
    } catch {
      return false;
    }
  });
  let added = 0;
  let skipped = 0;
  let total = 0;
  for (const root of roots) {
    try {
      const files = await scanFolder(root);
      const result = await store.upsertGames(files);
      added += result.added;
      skipped += result.skipped;
      total += files.length;
    } catch {
      /* one unreadable root must not block the rest */
    }
  }
  return { roots, added, skipped, total };
}

export function createServices(onEvent: (payload: unknown) => void): Services {
  const store = new Store(path.join(app.getPath('userData'), 'library.json'));
  const engines = new EngineRegistry(enginesDir());
  const supervisor = new Supervisor({ emit: onEvent });
  return { store, engines, supervisor };
}

function toView(systemId: string, store: Store): SystemView | null {
  const def = systemById.get(systemId as SystemId);
  if (!def) return null;
  const stats = store.stats(systemId);
  const scanned = store.gameCount(systemId);
  return { ...def, ...stats, games: scanned > 0 ? scanned : stats.games };
}

/* ------------------------------------------------------------- controls */
/** Where every engine keeps its config; the adapters receive this instead of
 *  knowing about Electron itself. */
function controlPaths(): ControlPaths {
  return { enginesDir: enginesDir(), userData: app.getPath('userData') };
}

/** Complete binding set = engine defaults overlaid with the user's overrides. */
function effectiveBindings(store: Store, engineId: string): KeyboardBindings {
  const overrides = store.getSettings().controls?.[engineId]?.keyboard ?? {};
  return { ...defaultBindings(engineId), ...overrides };
}

/** Where a portable engine's config lives: next to the exe Nest will launch. */
function detectedEngineDir(services: Services, engineId: string): string | undefined {
  if (engineId !== 'mgba' && engineId !== 'melonds' && engineId !== 'ares') return undefined;
  const manifest = services.engines.get(engineId);
  const detected = manifest ? services.engines.detect(manifest) : null;
  return detected ? path.dirname(detected) : undefined;
}

/**
 * Apply one engine's keyboard layout. `force=false` keeps a layout the player
 * customised inside the emulator; `force=true` is used after the player edits
 * the mapping in Nest (save / reset) and always rewrites.
 */
function applyControls(
  services: Services,
  engineId: string,
  force: boolean,
  options: { gamepads?: number; mode?: 'keyboard' | 'gamepad'; engineDir?: string } = {},
) {
  // Portable engines may live outside `resources/engines` (user-installed
  // mGBA/melonDS); their config sits next to the executable we actually run.
  const result = applyEngineControls(
    engineId,
    controlPaths(),
    effectiveBindings(services.store, engineId),
    force,
    { ...options, engineDir: options.engineDir ?? detectedEngineDir(services, engineId) },
  );
  if (result.reason === 'custom') {
    console.log(`[nest] ${engineId} controls: custom layout kept`);
  } else if (result.applied) {
    console.log(`[nest] ${engineId} controls applied (${result.files.join(', ')})`);
  } else if (result.reason === 'unsupported') {
    console.log(`[nest] ${engineId} controls: unsupported (no writer yet)`);
  } else if (!result.applied) {
    console.log(`[nest] ${engineId} controls: skipped (${result.reason ?? 'unknown'})`);
  }
  return result;
}

/** How many controllers SDL can see right now (0 = none, -1 = probe failed). */
function countGamepads(): number {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const exe = path.join(base, 'resources', 'tools', 'nest-pads.exe');
  try {
    const out = spawnSync(exe, [], { windowsHide: true, timeout: 5000, encoding: 'utf8' });
    const match = /count=(-?\d+)/.exec(String(out.stdout ?? ''));
    return match ? Number(match[1]) : -1;
  } catch {
    return -1;
  }
}

/** Keep only known actions and plausible `KeyboardEvent.code` strings. */
function sanitizeEngineControls(raw: unknown): EngineControls | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as { mode?: unknown; keyboard?: unknown };
  const controls: EngineControls = {};
  if (input.mode === 'keyboard' || input.mode === 'gamepad') controls.mode = input.mode;
  if (input.keyboard && typeof input.keyboard === 'object') {
    const keyboard: KeyboardBindings = {};
    for (const [action, value] of Object.entries(input.keyboard as Record<string, unknown>)) {
      if (!(PAD_ACTIONS as readonly string[]).includes(action)) continue;
      if (typeof value !== 'string' || value.length === 0 || value.length > 24) continue;
      keyboard[action as PadAction] = value;
    }
    if (Object.keys(keyboard).length > 0) controls.keyboard = keyboard;
  }
  return controls.mode || controls.keyboard ? controls : null;
}

/** The payload the key-mapping panel reads: defaults, what the engine file
 *  currently says, and whether the player has a custom layout. */
function controlsPayload(services: Services): ControlsPayload {
  const store = services.store;
  const settings = store.getSettings();
  const paths = controlPaths();
  const engines: Record<string, EngineControlsView> = {};
  for (const engineId of CONTROL_ENGINE_IDS) {
    const overrides = settings.controls?.[engineId];
    const defaults = defaultBindings(engineId);
    const read = readEngineControls(engineId, paths, detectedEngineDir(services, engineId)) ?? {};
    const current: KeyboardBindings = { ...defaults, ...read };
    const mode =
      engineId === 'azahar'
        ? (overrides?.mode ?? readEngineMode(engineId, paths))
        : 'keyboard';
    // "custom" means the user changed the layout in Nest. A config that merely
    // differs from our defaults (an older seed, or a hand-edited emulator file)
    // still shows the real keys, but is not presented as a Nest override.
    const hasOverride = Boolean(overrides?.keyboard && Object.keys(overrides.keyboard).length > 0);
    engines[engineId] = {
      engineId,
      supported: isControlsSupported(engineId),
      mode,
      current,
      isCustom: hasOverride,
    };
  }
  return { engines };
}

export function registerIpc(services: Services): void {
  const { store, engines } = services;

  ipcMain.handle(CH.info, () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node,
  }));

  ipcMain.handle(CH.engines, () => engines.statuses());

  ipcMain.handle(CH.home, async (): Promise<HomePayload> => {
    const families = FAMILIES.map((family) => ({
      id: family.id,
      name: family.name,
      locked: family.locked,
      systems: systemsOf(family.id)
        .map((s) => toView(s.id, store))
        .filter((s): s is SystemView => s !== null),
    }));
    return { families, engines: engines.statuses(), version: app.getVersion() };
  });

  ipcMain.handle(CH.favorite, async (_event, raw) => {
    const parsed = favoriteRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'bad-request' };
    const stats = await store.setFavorite(parsed.data.systemId, parsed.data.favorite);
    return { ok: true, stats };
  });

  ipcMain.handle(CH.settings, () => store.getSettings());

  ipcMain.handle(CH.saveSettings, async (_event, raw) => {
    const parsed = settingsSchema.safeParse(raw ?? {});
    if (!parsed.success) return { ok: false, error: 'bad-request' };
    return { ok: true, settings: await store.setSettings(parsed.data) };
  });

  ipcMain.handle(CH.games, (_event, raw): GameRecord[] => {
    const parsed = gamesRequestSchema.safeParse(raw);
    if (!parsed.success) return [];
    return store.games(parsed.data.systemId).map(withCover);
  });

  ipcMain.handle(CH.removeGame, async (_event, raw) => {
    const gameId = String((raw as { gameId?: unknown })?.gameId ?? '');
    if (!gameId) return { ok: false, error: 'bad-request' };
    const removed = await store.removeGame(gameId);
    return removed ? { ok: true } : { ok: false, error: 'not-found' };
  });

  ipcMain.handle(CH.scan, async (event, raw): Promise<ScanResult> => {
    const parsed = scanRequestSchema.safeParse(raw ?? {});
    if (!parsed.success) return { ok: false, error: 'bad-request' };

    let root = parsed.data.path;
    if (!root) {
      const win = BrowserWindow.fromWebContents(event.sender);
      const picked = win
        ? await dialog.showOpenDialog(win, {
            title: '选择 ROM 文件夹',
            properties: ['openDirectory'],
          })
        : await dialog.showOpenDialog({ title: '选择 ROM 文件夹', properties: ['openDirectory'] });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, error: 'cancelled' };
      root = picked.filePaths[0];
    }

    try {
      const files = await scanFolder(root, { systemId: parsed.data.systemId });
      const { added, skipped } = await store.upsertGames(files);
      // Remember the folder so the next launch can re-scan it without asking.
      await rememberScanRoot(store, root);
      return { ok: true, root, added, skipped, total: files.length };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(CH.rescan, async (): Promise<ScanResult> => {
    const result = await rescanRoots(store);
    return { ok: true, root: result.roots.join(';'), added: result.added, skipped: result.skipped, total: result.total };
  });

  ipcMain.handle(CH.removeScanRoot, async (_event, raw) => {
    const root = String((raw as { root?: unknown })?.root ?? '').trim();
    if (!root) return { ok: false, error: 'bad-request' };
    const current = store.getSettings().scanRoots ?? [];
    const settings = await store.setSettings({ scanRoots: current.filter((item) => item !== root) });
    return { ok: true, settings };
  });

  ipcMain.handle(CH.launch, (_event, raw) => startLaunch(services, raw));

  ipcMain.handle(CH.stop, (_event, raw) => {
    const sessionId = String((raw as { sessionId?: unknown })?.sessionId ?? '');
    if (!sessionId) return { ok: false, error: 'bad-request' };
    return { ok: services.supervisor.stop(sessionId) };
  });

  ipcMain.handle(CH.firmwareStatus, () => firmwareStates(services));

  ipcMain.handle(CH.pickFirmware, async (_event, raw) => pickFirmware(services, raw));

  ipcMain.handle(CH.openHomepage, async (_event, raw) => {
    const url = String((raw as { url?: unknown })?.url ?? '');
    if (!/^https:\/\//.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle(CH.controls, (): ControlsPayload => controlsPayload(services));

  ipcMain.handle(CH.saveControls, async (_event, raw) => {
    const body = (raw ?? {}) as { engineId?: unknown; controls?: unknown };
    const engineId = typeof body.engineId === 'string' ? body.engineId : '';
    if (!(CONTROL_ENGINE_IDS as readonly string[]).includes(engineId)) {
      return { ok: false, error: 'unknown-engine' };
    }
    const controls = sanitizeEngineControls(body.controls);
    if (!controls) return { ok: false, error: 'bad-request' };

    const settings = store.getSettings();
    const controlsMap = {
      ...(settings.controls ?? {}),
      [engineId]: { ...controls, updatedAt: Date.now() },
    };
    await store.setSettings({ controls: controlsMap });

    // Apply immediately so the next launch (and the next in-game session) uses
    // the new keys without restarting Nest.
    const result = applyControls(services, engineId, true, {
      gamepads: engineId === 'azahar' ? countGamepads() : undefined,
      mode: controls.mode,
    });
    return { ok: true, supported: result.supported, applied: result.files };
  });

  ipcMain.handle(CH.resetControls, async (_event, raw) => {
    const engineId = String((raw as { engineId?: unknown })?.engineId ?? '');
    if (!(CONTROL_ENGINE_IDS as readonly string[]).includes(engineId)) {
      return { ok: false, error: 'unknown-engine' };
    }
    const settings = store.getSettings();
    const controlsMap = { ...(settings.controls ?? {}) };
    delete controlsMap[engineId];
    await store.setSettings({ controls: controlsMap });

    const result = applyControls(services, engineId, true, {
      gamepads: engineId === 'azahar' ? countGamepads() : undefined,
    });
    return { ok: true, supported: result.supported, applied: result.files };
  });
}

/** Shared by the IPC handler and the --selftest path. */
export async function startLaunch(services: Services, raw: unknown): Promise<LaunchResult> {
  const parsed = launchRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'bad-request' };
  const { systemId, mode, rom } = parsed.data;

  const system = systemById.get(systemId as SystemId);
  if (!system) return { ok: false, error: 'unknown-system' };
  if (system.state === 'locked') return { ok: false, error: 'not-supported' };

  const preferred = services.engines.get(
    process.env.NEST_FAKE_ENGINE === '1' ? 'fake' : system.engine,
  );
  if (!preferred) return { ok: false, error: 'engine-manifest-missing' };

  // Wii system mode uses Nest's own libretro host exclusively — no Dolphin Qt
  // fallback, no UIA fallback. The goal is that the Wii Menu never depends on
  // GUI automation or the Dolphin menu language. A package without the host or
  // core reports an explicit error instead of silently booting another way.
  //
  // GameCube Menu is deliberately NOT switched: the Dolphin libretro core has
  // no content-free boot path (it crashes), so the GC menu still needs
  // Dolphin Qt + UIA. See docs/PLAN-LIBRETRO.md ("无内容启动 核心不支持").
  let engine = preferred;
  if (mode === 'system' && systemId === 'wii' && preferred.id !== 'fake') {
    const libretro = services.engines.get('dolphin-lr');
    const availability = libretro ? libretroAvailability(libretroPaths()) : null;
    if (!libretro || !availability?.available) {
      console.error(
        '[nest] Wii Menu 需要 libretro 宿主：缺少 resources/tools/nest-libretro.exe 或 ' +
          'resources/engines/dolphin/dolphin_libretro.dll（本安装包不完整，请更新 Nest）。',
      );
      return { ok: false, error: 'libretro-host-missing' };
    }
    if (!findWiiMenuWad(app.getPath('userData'))) {
      console.error(
        '[nest] 缺少 Wii Menu WAD：请把自备的 wii-menu.wad 通过「设置 → 系统文件（自备）」导入。',
      );
      return { ok: false, error: 'missing-wii-menu' };
    }
    const staged = stageLibretroRuntime(libretroPaths());
    if (!staged.ok) {
      console.error(`[nest] libretro runtime staging failed: ${staged.errors.join('; ')}`);
      return { ok: false, error: 'libretro-not-ready' };
    }
    engine = libretro;
    console.log(
      `[nest] system mode wii: libretro host only (staged ${staged.staged.length} item(s))`,
    );
  }

  // Safety net: never hand a content-free boot to the libretro core.
  if (mode === 'system' && engine.id === 'dolphin-lr' && systemId !== 'wii') {
    return { ok: false, error: 'system-mode-not-supported-by-libretro-host' };
  }

  // NGC system mode still goes through Dolphin Qt + UIA (the libretro core has
  // no GC menu entry); check its IPL prerequisite before spawning anything.
  let dolphinIpl: DolphinIpl | null = null;
  if (engine.id === 'dolphin') {
    if (mode === 'system' && systemId === 'ngc') {
      dolphinIpl = findDolphinIpl();
      if (!dolphinIpl) return { ok: false, error: 'missing-ipl' };
    }
  }

  let command: string;
  let args: string[];
  let env: NodeJS.ProcessEnv | undefined;

  if (engine.kind === 'node') {
    const script = path.join(app.getAppPath(), engine.script ?? '');
    command = process.execPath;
    env = { ELECTRON_RUN_AS_NODE: '1' };
    args = [script, ...(mode === 'system' ? engine.launch.systemArgs : engine.launch.args)];
  } else {
    const detected = services.engines.detect(engine);
    if (!detected) return { ok: false, error: 'engine-not-installed' };
    command = detected;
    args = mode === 'system' ? (engine.systemArgsBySystem?.[systemId] ?? engine.launch.systemArgs) : engine.launch.args;
  }

  if (engine.id === 'mgba') applyControls(services, 'mgba', false);
  if (engine.id === 'ares') applyControls(services, 'ares', false);

  // Azahar resolves its data folder from the Windows user profile
  // (`%APPDATA%\Azahar`), not from `--user-data-dir` and not from APPDATA alone.
  // Redirecting USERPROFILE for the child process keeps 3DS config / NAND inside
  // Nest's data directory instead of leaving a second copy in %APPDATA%.
  if (engine.id === 'azahar') {
    const root = path.join(app.getPath('userData'), 'azahar');
    const roaming = path.join(root, 'AppData', 'Roaming');
    const local = path.join(root, 'AppData', 'Local');
    mkdirSync(roaming, { recursive: true });
    mkdirSync(local, { recursive: true });
    applyControls(services, 'azahar', false, {
      gamepads: countGamepads(),
      mode: services.store.getSettings().controls?.azahar?.mode,
    });
    env = { USERPROFILE: root, APPDATA: roaming, LOCALAPPDATA: local };
    console.log(`[nest] azahar user dir: ${root}`);
  }

  args = buildArgs(args, {
    rom: rom ?? '',
    system: systemId,
    userData: app.getPath('userData'),
    engines: enginesDir(),
  });

  // Cemu: keys.txt lives in the portable folder (decryption is mandatory), the
  // user's NAND/MLC is passed with `-m` and only stored as a path in settings.
  // System mode (Wii U Menu) is refused without a usable MLC.
  if (engine.id === 'cemu') {
    const keys = cemuKeysPath(enginesDir());
    if (!existsSync(keys)) {
      console.error(
        '[nest] Cemu 需要 keys.txt：请在「设置 → 系统文件（自备）」导入自备的 Wii U 解密密钥。',
      );
      return { ok: false, error: 'missing-cemu-keys' };
    }
    const mlc = services.store.getSettings().cemuMlc ?? null;
    const cemu = applyCemuLaunchOptions({ mode, mlc, args });
    if (!cemu.ok) {
      console.error(
        cemu.error === 'missing-wiiu-mlc'
          ? '[nest] Wii U Menu 需要 NAND/MLC：请在「设置 → 系统文件（自备）」选择 MLC 目录。'
          : `[nest] Wii U NAND 目录无效：${mlc ?? '(未设置)'}`,
      );
      return { ok: false, error: cemu.error };
    }
    args = cemu.args;
  }

  // Pass the player's custom keyboard layout to the host. The host already has
  // a sane default table; only overrides from the key-mapping panel are sent, so
  // an untouched install produces no --keys argument at all.
  if (engine.id === 'dolphin-lr') {
    const controls = services.store.getSettings().controls;
    const overrides = {
      ...(controls?.['dolphin']?.keyboard ?? {}),
      ...(controls?.['dolphin-lr']?.keyboard ?? {}),
    };
    const keys = hostKeysSpec(systemId, overrides);
    if (keys) {
      args = [...args, '--keys', keys];
      console.log(`[nest] libretro keys: ${keys}`);
    }
  }

  // mGBA (and most Qt frontends) only parse options that come before the ROM,
  // so everything we add goes in front of the argument list.
  const extras: string[] = [];
  const settings = services.store.getSettings();
  const fullscreenFlag = engine.launch.fullscreenFlag ?? engine.fullscreenFlag;
  if (settings.fullscreen && fullscreenFlag) {
    extras.push(fullscreenFlag);
  }
  if (engine.launch.configFlag && engine.launch.screenshotPathOption) {
    const dir = shotsDir();
    await mkdir(dir, { recursive: true });
    extras.push(engine.launch.configFlag, `${engine.launch.screenshotPathOption}=${dir}`);
  }
  args = [...extras, ...args];

  console.log(
    `[nest] launch system=${systemId} mode=${mode} engine=${engine.id} ` +
      `cmd="${command}" args=${JSON.stringify(args)} cwd="${path.dirname(command)}"`,
  );

  // Dolphin boots the IPL before a disc when SkipIPL=false, and then refuses to
  // start if the *disc region's* IPL is missing ("找不到 GC IPL"). Direct play
  // never needs it, so make sure the setting stays sane even if a previous
  // experiment (or the user) turned it on. System mode is the exception: the
  // GameCube menu is the IPL, so it needs SkipIPL=false.
  if (engine.id === 'dolphin') {
    ensureDolphinConfig(mode, systemId);
    applyControls(services, 'dolphin', false);
  }

  // melonDS boots its firmware menu from the GUI (File → Boot firmware) and
  // only with real BIOS/firmware dumps; FreeBIOS cannot show the DS menu.
  if (engine.id === 'melonds') {
    if (!ensureMelondsConfig(mode === 'system')) return { ok: false, error: 'missing-nds-bios' };
    applyControls(services, 'melonds', false);
  }

  if (engine.id === 'dolphin-lr') {
    // Staging is idempotent, but game mode needs it too when it is switched on
    // later: the core cannot boot without `<sys>/dolphin-emu/Sys`.
    const staged = stageLibretroRuntime(libretroPaths());
    if (!staged.ok) return { ok: false, error: 'libretro-not-ready' };
    resetLibretroShots(libretroShotDir(app.getPath('userData')));
  }

  const sessionId = randomUUID();
  const game = rom ? services.store.games().find((g) => g.path === rom) : undefined;
  const started = services.supervisor.start({
    sessionId,
    systemId,
    gameId: game?.id ?? null,
    command,
    args,
    env,
    cwd: path.dirname(command),
    windowsHide: engine.kind === 'node',
  });
  if (!started) return { ok: false, error: 'already-running' };
  sessionEngines.set(sessionId, engine.id);

  await services.store.recordSession(systemId, Date.now(), game?.id);

  // Some engines expose "system mode" only through their GUI (Dolphin: Tools →
  // Load GameCube Main Menu). The manifest describes how to get there; a helper
  // either drives the menu through UI Automation (no focus needed, preferred) or
  // replays a key sequence. A watcher ends the session when the emulation window
  // closes, because the launcher process outlives it.
  if (mode === 'system' && engine.systemBoot && !engine.systemArgsBySystem?.[systemId]) {
    const pid = services.supervisor.pid(sessionId);
    if (pid) {
      const boot = { ...engine.systemBoot };
      // The NGC menu is region-specific; use the IPL we actually found.
      if (systemId === 'ngc' && dolphinIpl) boot.item = dolphinIpl.item;
      const tools = app.isPackaged
    ? path.join(process.resourcesPath, 'tools')
    : path.join(app.getAppPath(), 'resources', 'tools');
      const logDir = path.join(app.getPath('userData'), 'shots');
      const useMenu = Boolean(boot.menu);

      const args = [
        '--pid',
        String(pid),
        '--delay',
        String(boot.delay ?? 9000),
        ...(boot.title ? ['--title', boot.title] : []),
        ...(boot.top ? ['--top', boot.top] : []),
        ...(boot.minimize ? ['--minimize'] : []),
        '--log',
        path.join(logDir, useMenu ? 'menu.log' : 'input.log'),
      ];
      if (useMenu) {
        args.push('--menu', boot.menu!);
        if (boot.item) args.push('--item', boot.item);
      } else {
        args.push('--keys', boot.keys!, '--step', String(boot.step ?? 800));
      }

      const helperName = useMenu ? 'nest-menu.exe' : 'nest-input.exe';
      const helper = spawn(path.join(tools, helperName), args, {
        windowsHide: true,
        stdio: 'ignore',
      });
      helper.once('exit', (code) => {
        console.log(`[nest] ${helperName} finished (code ${code}) for system=${systemId}`);
      });
      console.log(`[nest] ${helperName} armed for mode=system system=${systemId}`);

      const watcher = spawn(
        path.join(tools, 'nest-window.exe'),
        [
          '--pid',
          String(pid),
          ...(boot.renderTitle ? ['--render-title', boot.renderTitle] : []),
          '--log',
          path.join(logDir, 'window.log'),
        ],
        { windowsHide: true, stdio: 'ignore' },
      );
      watcher.once('exit', (code) => {
        console.log(`[nest] window watcher finished (code ${code}) for system=${systemId}`);
        if (code === 0) services.supervisor.stop(sessionId);
      });
      console.log(`[nest] window watcher armed for mode=system system=${systemId}`);
    }
  }

  return { ok: true, sessionId };
}

/**
 * Dolphin keeps its settings in `<userData>/dolphin/Config/Dolphin.ini`.
 * Only the keys Nest has an opinion about are managed here; everything else is
 * left untouched so settings changed in Dolphin's own UI survive.
 *
 * SkipIPL is mode-dependent: direct disc boot must skip the IPL (otherwise a
 * missing regional IPL blocks the game), but the real GameCube menu *is* the
 * IPL and therefore needs it enabled.
 */
function ensureDolphinConfig(mode: 'game' | 'system', systemId: string): void {
  const dir = path.join(dolphinUserDir(), 'Config');
  const file = path.join(dir, 'Dolphin.ini');
  const skipIpl = mode === 'system' && systemId === 'ngc' ? 'False' : 'True';
  const managed: Array<[string, string, string]> = [
    ['Core', 'SkipIPL', skipIpl],
    ['Analytics', 'Enabled', 'False'],
    ['Analytics', 'PermissionAsked', 'True'],
  ];

  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    text = '';
  }
  const original = text;

  for (const [section, key, value] of managed) {
    const header = `[${section}]`;
    const line = `${key} = ${value}`;
    const sectionIndex = text.indexOf(header);
    if (sectionIndex < 0) {
      if (text.length > 0 && !text.endsWith('\n')) text += '\n';
      text += `${header}\n${line}\n`;
      continue;
    }
    const after = text.indexOf('\n[', sectionIndex + header.length);
    const end = after < 0 ? text.length : after;
    const block = text.slice(sectionIndex, end);
    const keyPattern = new RegExp(`^${key}\\s*=.*$`, 'm');
    const replaced = keyPattern.test(block)
      ? block.replace(keyPattern, line)
      : `${block.replace(/\s+$/, '')}\n${line}\n`;
    text = text.slice(0, sectionIndex) + replaced + text.slice(end);
  }

  mkdirSync(dir, { recursive: true });
  if (text !== original) {
    writeFileSync(file, text, 'utf8');
    console.log(`[nest] dolphin config: SkipIPL=${skipIpl} (${mode}/${systemId})`);
  }
}
