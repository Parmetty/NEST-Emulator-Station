import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { app, ipcMain, shell } from 'electron';
import {
  CH,
  favoriteRequestSchema,
  launchRequestSchema,
  type HomePayload,
  type LaunchResult,
  type SystemView,
} from '../shared/contract';
import { FAMILIES, systemsOf, systemById, type SystemId } from '../shared/systems';
import { EngineRegistry, buildArgs } from './engines';
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
  return { ...def, ...stats };
}

export function registerIpc(services: Services): void {
  const { store, engines, supervisor } = services;

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

  ipcMain.handle(CH.launch, async (_event, raw): Promise<LaunchResult> => {
    const parsed = launchRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'bad-request' };
    const { systemId, mode } = parsed.data;

    const system = systemById.get(systemId as SystemId);
    if (!system) return { ok: false, error: 'unknown-system' };
    if (system.state === 'locked') return { ok: false, error: 'not-supported' };

    const engine = engines.get(system.engine);
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
      const detected = engines.detect(engine);
      if (!detected) return { ok: false, error: 'engine-not-installed' };
      command = detected;
      args = mode === 'system' ? engine.launch.systemArgs : engine.launch.args;
    }

    args = buildArgs(args, { rom: '', system: systemId });

    const sessionId = randomUUID();
    const started = supervisor.start({
      sessionId,
      systemId,
      command,
      args,
      env,
      cwd: path.dirname(command),
    });
    if (!started) return { ok: false, error: 'already-running' };

    await store.recordSession(systemId, Date.now());
    return { ok: true, sessionId };
  });

  ipcMain.handle(CH.stop, (_event, raw) => {
    const sessionId = String((raw as { sessionId?: unknown })?.sessionId ?? '');
    if (!sessionId) return { ok: false, error: 'bad-request' };
    return { ok: supervisor.stop(sessionId) };
  });

  ipcMain.handle(CH.openHomepage, async (_event, raw) => {
    const url = String((raw as { url?: unknown })?.url ?? '');
    if (!/^https:\/\//.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });
}
