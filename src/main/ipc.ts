import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import {
  CH,
  favoriteRequestSchema,
  gamesRequestSchema,
  launchRequestSchema,
  scanRequestSchema,
  settingsSchema,
  type FirmwareState,
  type GameRecord,
  type HomePayload,
  type LaunchResult,
  type ScanResult,
  type SystemView,
} from '../shared/contract';
import { FAMILIES, systemsOf, systemById, type SystemId } from '../shared/systems';
import { EngineRegistry, buildArgs } from './engines';
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

function firmwareStates(): FirmwareState[] {
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

  return states;
}

/**
 * Lets the user point Nest at firmware they dumped themselves. Nothing here is
 * bundled or downloaded: the file is copied into Nest's own data folder so the
 * engine can find it, and the CRC decides which region folder an IPL belongs to.
 */
async function pickFirmware(raw: unknown): Promise<{
  ok: boolean;
  canceled?: boolean;
  error?: string;
  state?: FirmwareState;
}> {
  const kind = (raw as { kind?: unknown })?.kind;
  if (kind !== 'gc-ipl' && kind !== 'wii-menu' && kind !== 'nds-bios') {
    return { ok: false, error: 'bad-request' };
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
    return { ok: true, state: firmwareStates().find((state) => state.kind === kind) };
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

  return { ok: true, state: firmwareStates().find((state) => state.kind === kind) };
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
      return { ok: true, root, added, skipped, total: files.length };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(CH.launch, (_event, raw) => startLaunch(services, raw));

  ipcMain.handle(CH.stop, (_event, raw) => {
    const sessionId = String((raw as { sessionId?: unknown })?.sessionId ?? '');
    if (!sessionId) return { ok: false, error: 'bad-request' };
    return { ok: services.supervisor.stop(sessionId) };
  });

  ipcMain.handle(CH.firmwareStatus, () => firmwareStates());

  ipcMain.handle(CH.pickFirmware, async (_event, raw) => pickFirmware(raw));

  ipcMain.handle(CH.openHomepage, async (_event, raw) => {
    const url = String((raw as { url?: unknown })?.url ?? '');
    if (!/^https:\/\//.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
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

  const engine = services.engines.get(
    process.env.NEST_FAKE_ENGINE === '1' ? 'fake' : system.engine,
  );
  if (!engine) return { ok: false, error: 'engine-manifest-missing' };

  // Dolphin's two system modes have very different prerequisites. Check them
  // before spawning anything so the UI can report a useful error instead of
  // leaving the user with a Dolphin warning dialog.
  let dolphinIpl: DolphinIpl | null = null;
  let wiiFromNand = false;
  if (engine.id === 'dolphin') {
    if (mode === 'system' && systemId === 'ngc') {
      dolphinIpl = findDolphinIpl();
      if (!dolphinIpl) return { ok: false, error: 'missing-ipl' };
    } else if (mode === 'system' && systemId === 'wii') {
      const wad = path.join(dolphinUserDir(), 'wii-menu.wad');
      if (!existsSync(wad)) {
        const nandTitle = path.join(
          dolphinUserDir(),
          'Wii',
          'title',
          '00000001',
          '00000002',
          'content',
          'title.tmd',
        );
        if (!existsSync(nandTitle)) return { ok: false, error: 'missing-wii-menu' };
        wiiFromNand = true;
      }
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

  if (engine.id === 'mgba') {
    const mgbaExe = services.engines.detect(engine);
    if (mgbaExe) ensureMgbaControls(path.dirname(mgbaExe));
  }

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
    ensureAzaharControls(root, countGamepads());
    env = { USERPROFILE: root, APPDATA: roaming, LOCALAPPDATA: local };
    console.log(`[nest] azahar user dir: ${root}`);
  }

  args = buildArgs(args, {
    rom: rom ?? '',
    system: systemId,
    userData: app.getPath('userData'),
    engines: enginesDir(),
  });

  // A WAD is the portable route, but an already-installed NAND system menu is
  // even quieter: boot title 0000000100000002 directly.
  if (engine.id === 'dolphin' && wiiFromNand) {
    args = ['-u', dolphinUserDir(), '-b', '-n', '0000000100000002'];
  }

  // mGBA (and most Qt frontends) only parse options that come before the ROM,
  // so everything we add goes in front of the argument list.
  const extras: string[] = [];
  const settings = services.store.getSettings();
  if (settings.fullscreen && engine.launch.fullscreenFlag) {
    extras.push(engine.launch.fullscreenFlag);
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
  if (engine.id === 'dolphin') ensureDolphinConfig(mode, systemId);

  // melonDS boots its firmware menu from the GUI (File → Boot firmware) and
  // only with real BIOS/firmware dumps; FreeBIOS cannot show the DS menu.
  if (engine.id === 'melonds' && !ensureMelondsConfig(mode === 'system')) {
    return { ok: false, error: 'missing-nds-bios' };
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
  seedDolphinInputDefaults(dir);
}

/**
 * Give Dolphin a console-style keyboard layout once. Never overwrite a layout
 * the user has already customised; a marker file makes this a one-shot seed.
 */
function seedDolphinInputDefaults(configDir: string): void {
  const marker = path.join(configDir, '.nest-controls-v1');
  if (existsSync(marker)) return;

  const pad = path.join(configDir, 'GCPadNew.ini');
  let existing = '';
  try {
    existing = readFileSync(pad, 'utf8');
  } catch {
    existing = '';
  }

  const looksUntouched =
    existing.length === 0 ||
    (existing.includes('Buttons/A = `X`') && existing.includes('Main Stick/Up = `UP`'));
  if (!looksUntouched) {
    console.log('[nest] dolphin controller config is customised; leaving it untouched');
    writeFileSync(marker, 'kept-user-config\n', 'utf8');
    return;
  }

  const padConfig = [
    '[GCPad1]',
    'Device = DInput/0/Keyboard Mouse',
    'Buttons/A = `SPACE`',
    'Buttons/B = `J`',
    'Buttons/X = `K`',
    'Buttons/Y = `L`',
    'Buttons/Z = `U`',
    'Buttons/Start = `RETURN`',
    'Main Stick/Up = `W`',
    'Main Stick/Down = `S`',
    'Main Stick/Left = `A`',
    'Main Stick/Right = `D`',
    'Main Stick/Calibration = 100.00 141.42 100.00 141.42 100.00 141.42 100.00 141.42',
    'C-Stick/Up = `T`',
    'C-Stick/Down = `G`',
    'C-Stick/Left = `F`',
    'C-Stick/Right = `H`',
    'C-Stick/Calibration = 100.00 141.42 100.00 141.42 100.00 141.42 100.00 141.42',
    'Triggers/L = `Q`',
    'Triggers/R = `E`',
    'D-Pad/Up = `UP`',
    'D-Pad/Down = `DOWN`',
    'D-Pad/Left = `LEFT`',
    'D-Pad/Right = `RIGHT`',
    'Triforce/Test = `1`',
    'Triforce/Service = `2`',
    'Triforce/Coin = `3`',
    '[GCPad2]',
    'Device = DInput/0/Keyboard Mouse',
    '[GCPad3]',
    'Device = DInput/0/Keyboard Mouse',
    '[GCPad4]',
    'Device = DInput/0/Keyboard Mouse',
    '',
  ].join('\r\n');

  try {
    if (existing.length > 0) {
      writeFileSync(`${pad}.before-nest`, existing, 'utf8');
    }
    writeFileSync(pad, padConfig, 'utf8');
    writeFileSync(marker, 'applied-v1\n', 'utf8');
    console.log('[nest] dolphin controller defaults installed (WASD + Space/J/K/L)');
  } catch (err) {
    console.error('[nest] dolphin controller defaults failed:', (err as Error).message);
  }
}

/* -------------------------------------------------------- mGBA (GBA) keys */
/**
 * mGBA runs in portable mode, so the bundled `config.ini` is its live config.
 * The stock QT block is A=X / B=Z / L=A / R=S — neither the Dolphin nor the
 * Azahar layout. Seed the same face-button layout Nest uses elsewhere, once,
 * and never overwrite a file the player has customised.
 */
const MGBA_KEYS: Array<[string, number]> = [
  ['keyA', 32], // space
  ['keyB', 74], // J
  ['keyL', 81], // Q
  ['keyR', 69], // E
  ['keyStart', 16777220], // Enter
  ['keySelect', 16777219], // Backspace
  ['keyUp', 16777235],
  ['keyDown', 16777237],
  ['keyLeft', 16777234],
  ['keyRight', 16777236],
];

/**
 * Gamepad buttons (SDL GameController indexes). mGBA's own defaults only cover
 * the left stick and the d-pad hat, so a plugged-in pad can move but cannot
 * press anything until these are filled in.
 */
const MGBA_PAD_KEYS: Array<[string, number]> = [
  ['keyA', 0],
  ['keyB', 1],
  ['keyL', 9],
  ['keyR', 10],
  ['keyStart', 6],
  ['keySelect', 4],
];

function ensureMgbaControls(engineDir: string): void {
  const file = path.join(engineDir, 'config.ini');
  const marker = path.join(engineDir, '.nest-controls-v1');

  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    text = '';
  }

  // Empty file (fresh bundle), mGBA's stock layout, or our own keyboard seed.
  const stock = text.length === 0 || (text.includes('keyA=88') && text.includes('keyB=90'));
  const keyboardSeed = text.includes('keyA=32') && text.includes('keyB=74');
  if (!stock && !keyboardSeed) {
    if (!existsSync(marker)) {
      writeFileSync(marker, 'kept-user-config\n', 'utf8');
      console.log('[nest] mgba controller config is customised; leaving it untouched');
    }
    return;
  }

  try {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    if (text.length > 0) writeFileSync(`${file}.before-nest`, text, 'utf8');
    if (text.length === 0) text = '[gba.input.QT_K]';

    const lines = text.split(/\r?\n/);
    const padStock = text.includes('keyA=-1');
    const sections: Array<[string, Array<[string, number]>]> = [
      ['[gba.input.QT_K]', MGBA_KEYS],
      ['[gba.input.SDLB]', padStock ? MGBA_PAD_KEYS : []],
    ];

    for (const [sectionName, keys] of sections) {
      if (keys.length === 0) continue;
      let section = '';
      for (let i = 0; i < lines.length; i += 1) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          section = trimmed;
          continue;
        }
        if (section !== sectionName) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const hit = keys.find(([name]) => name === trimmed.slice(0, eq));
        if (hit) lines[i] = `${hit[0]}=${hit[1]}`;
      }

      // Add keys the file does not carry yet, right after the section header.
      const header = lines.indexOf(sectionName);
      if (header >= 0) {
        const additions = keys
          .filter(([key]) => !lines.some((line) => line.trim().startsWith(`${key}=`)))
          .map(([key, value]) => `${key}=${value}`);
        if (additions.length > 0) lines.splice(header + 1, 0, ...additions);
      }
    }

    writeFileSync(file, lines.join(eol), 'utf8');
    writeFileSync(marker, 'applied-v1\n', 'utf8');
    console.log('[nest] mgba controls installed (keyboard Space/J/Q/E + pad buttons)');
  } catch (err) {
    console.error('[nest] mgba controller defaults failed:', (err as Error).message);
  }
}

/* ------------------------------------------------------- Azahar (3DS) keys */
/**
 * Azahar stores its controls in `qt-config.ini`, one flat key per button
 * (`profiles\1\button_a="code:32,engine:keyboard"`). Values are Qt key codes;
 * analog sticks are encoded as `analog_from_button` maps where `$0` is `:` and
 * `$1` is `,`. The stock layout is A/S/Z/X + arrow keys, which clashes with the
 * WASD muscle memory Nest already gives Dolphin players, so we seed the same
 * layout once — never overwriting a layout the user has changed.
 */
const AZAHAR_KEYBOARD_CONTROLS: Array<[string, string]> = [
  ['profiles\\1\\button_a', '"code:32,engine:keyboard"'],
  ['profiles\\1\\button_b', '"code:74,engine:keyboard"'],
  ['profiles\\1\\button_x', '"code:75,engine:keyboard"'],
  ['profiles\\1\\button_y', '"code:76,engine:keyboard"'],
  ['profiles\\1\\button_l', '"code:81,engine:keyboard"'],
  ['profiles\\1\\button_r', '"code:69,engine:keyboard"'],
  ['profiles\\1\\button_zl', '"code:49,engine:keyboard"'],
  ['profiles\\1\\button_zr', '"code:50,engine:keyboard"'],
  ['profiles\\1\\button_start', '"code:16777220,engine:keyboard"'],
  ['profiles\\1\\button_select', '"code:16777219,engine:keyboard"'],
  ['profiles\\1\\button_up', '"code:16777235,engine:keyboard"'],
  ['profiles\\1\\button_down', '"code:16777236,engine:keyboard"'],
  ['profiles\\1\\button_left', '"code:16777237,engine:keyboard"'],
  ['profiles\\1\\button_right', '"code:16777238,engine:keyboard"'],
  [
    'profiles\\1\\circle_pad',
    '"down:code$083$1engine$0keyboard,engine:analog_from_button,left:code$065$1engine$0keyboard,' +
      'modifier:code$068$1engine$0keyboard,modifier_scale:0.500000,right:code$068$1engine$0keyboard,' +
      'up:code$087$1engine$0keyboard"',
  ],
  [
    'profiles\\1\\c_stick',
    '"down:code$071$1engine$0keyboard,engine:analog_from_button,left:code$070$1engine$0keyboard,' +
      'modifier:code$068$1engine$0keyboard,modifier_scale:0.500000,right:code$072$1engine$0keyboard,' +
      'up:code$084$1engine$0keyboard"',
  ],
];

/**
 * Gamepad layout for Azahar. `maptype:all` + `api:controller` binds "whichever
 * SDL gamepad is attached", so the same config works for Xbox / DualShock /
 * DualSense / Switch Pro / 8BitDo without touching per-device GUIDs.
 *
 * 3DS A/B/X/Y map to pad B/A/Y/X so the *physical* button positions match a
 * Nintendo handheld (3DS A is the right-hand button). ZL/ZR are trigger axes.
 */
const AZAHAR_GAMEPAD_CONTROLS: Array<[string, string]> = [
  ['profiles\\1\\button_a', '"button:1,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_b', '"button:0,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_x', '"button:3,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_y', '"button:2,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_up', '"button:11,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_down', '"button:12,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_left', '"button:13,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_right', '"button:14,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_l', '"button:9,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_r', '"button:10,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_start', '"button:6,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_select', '"button:4,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  [
    'profiles\\1\\button_zl',
    '"axis:4,engine:sdl,guid:0,port:-1,maptype:all,api:controller,direction:+,threshold:0.5"',
  ],
  [
    'profiles\\1\\button_zr',
    '"axis:5,engine:sdl,guid:0,port:-1,maptype:all,api:controller,direction:+,threshold:0.5"',
  ],
  ['profiles\\1\\button_home', '"button:5,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  [
    'profiles\\1\\circle_pad',
    '"axis_x:0,axis_y:1,engine:sdl,guid:0,port:-1,maptype:all,api:controller"',
  ],
  [
    'profiles\\1\\c_stick',
    '"axis_x:2,axis_y:3,engine:sdl,guid:0,port:-1,maptype:all,api:controller"',
  ],
];

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace `key=value` in one ini section, or add it under `[Controls]`. */
function upsertControl(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, () => line);
  const header = text.indexOf('[Controls]');
  if (header < 0) return `[Controls]\n${line}\n${text}`;
  const insertAt = text.indexOf('\n', header) + 1;
  return `${text.slice(0, insertAt)}${line}\n${text.slice(insertAt)}`;
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

function ensureAzaharControls(root: string, gamepads: number): void {
  const dir = path.join(root, 'AppData', 'Roaming', 'Azahar', 'config');
  const file = path.join(dir, 'qt-config.ini');
  const legacyMarker = path.join(root, '.nest-controls-v1');
  const modeMarker = path.join(root, '.nest-controls-mode');
  const desired = gamepads > 0 ? 'gamepad' : 'keyboard';

  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    text = '';
  }

  const hasKeyboardSeed = text.includes('profiles\\1\\button_a="code:32,engine:keyboard"');
  const hasGamepadSeed = text.includes('profiles\\1\\button_a="button:1,engine:sdl');
  const stock = text.length === 0 || text.includes('profiles\\1\\button_a="code:65,engine:keyboard"');

  // Not stock and not one of our two layouts: the player customised it.
  if (!stock && !hasKeyboardSeed && !hasGamepadSeed) {
    if (!existsSync(legacyMarker)) {
      writeFileSync(legacyMarker, 'kept-user-config\n', 'utf8');
      console.log('[nest] azahar controller config is customised; leaving it untouched');
    }
    return;
  }

  if (desired === 'gamepad' ? hasGamepadSeed : hasKeyboardSeed) {
    writeFileSync(modeMarker, `${desired}\n`, 'utf8');
    return;
  }

  const pairs = desired === 'gamepad' ? AZAHAR_GAMEPAD_CONTROLS : AZAHAR_KEYBOARD_CONTROLS;
  try {
    mkdirSync(dir, { recursive: true });
    if (text.length > 0 && !hasKeyboardSeed && !hasGamepadSeed) {
      writeFileSync(`${file}.before-nest`, text, 'utf8');
    }
    if (text.length === 0) {
      text = [
        '[Controls]',
        'profile\\default=true',
        'profile=0',
        'profiles\\1\\name\\default=false',
        'profiles\\1\\name=Default',
        'profiles\\size=1',
        '',
      ].join('\n');
    }
    for (const [key, value] of pairs) {
      text = upsertControl(text, key, value);
      text = upsertControl(text, `${key}\\default`, 'false');
    }
    writeFileSync(file, text, 'utf8');
    writeFileSync(legacyMarker, 'applied-v1\n', 'utf8');
    writeFileSync(modeMarker, `${desired}\n`, 'utf8');
    console.log(`[nest] azahar controls: ${desired} (gamepads=${gamepads})`);
  } catch (err) {
    console.error('[nest] azahar controller defaults failed:', (err as Error).message);
  }
}
