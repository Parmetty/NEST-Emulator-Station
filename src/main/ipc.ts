import { randomUUID } from 'node:crypto';
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
    args = mode === 'system' ? engine.launch.systemArgs : engine.launch.args;
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
  return { ok: true, sessionId };
}
