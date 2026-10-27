import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

  args = buildArgs(args, {
    rom: rom ?? '',
    system: systemId,
    userData: app.getPath('userData'),
    engines: enginesDir(),
  });

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
  // experiment (or the user) turned it on.
  if (engine.id === 'dolphin') ensureDolphinConfig();

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
      const boot = engine.systemBoot;
      const tools = path.join(app.getAppPath(), 'resources', 'tools');
      const logDir = path.join(app.getPath('userData'), 'shots');
      const useMenu = Boolean(boot.menu && boot.item);

      const args = [
        '--pid',
        String(pid),
        '--delay',
        String(boot.delay ?? 9000),
        ...(boot.title ? ['--title', boot.title] : []),
        ...(boot.minimize ? ['--minimize'] : []),
        '--log',
        path.join(logDir, useMenu ? 'menu.log' : 'input.log'),
      ];
      if (useMenu) {
        args.push('--menu', boot.menu!, '--item', boot.item!);
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
        ['--pid', String(pid), '--log', path.join(logDir, 'window.log')],
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
 */
function ensureDolphinConfig(): void {
  const dir = path.join(app.getPath('userData'), 'dolphin', 'Config');
  const file = path.join(dir, 'Dolphin.ini');
  const managed: Array<[string, string, string]> = [
    ['Core', 'SkipIPL', 'True'],
    ['Analytics', 'Enabled', 'False'],
    ['Analytics', 'PermissionAsked', 'True'],
  ];

  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    text = '';
  }

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
  writeFileSync(file, text, 'utf8');
}
