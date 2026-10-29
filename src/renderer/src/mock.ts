import { FAMILIES, systemsOf } from '@shared/systems';
import type {
  ControlsPayload,
  EngineControls,
  GameRecord,
  HomePayload,
  KeyboardBindings,
  LaunchEvent,
  LaunchMode,
  Settings,
} from '@shared/contract';
import type { NestApi } from './env';

/**
 * Browser-only fallback: lets the real renderer run without Electron, which is
 * how we review the UI. The Electron build always provides the real IPC bridge.
 */
const STATS: Record<string, { games: number; saves: number; lastPlayed: string | null }> = {
  fc: { games: 642, saves: 210, lastPlayed: '昨天' },
  sfc: { games: 517, saves: 168, lastPlayed: '3d' },
  n64: { games: 187, saves: 74, lastPlayed: '1w' },
  gba: { games: 128, saves: 36, lastPlayed: '2h' },
  ngc: { games: 94, saves: 52, lastPlayed: '4d' },
  nds: { games: 412, saves: 130, lastPlayed: '1m' },
  wii: { games: 76, saves: 41, lastPlayed: '2w' },
  '3ds': { games: 168, saves: 61, lastPlayed: '3w' },
  wiiu: { games: 41, saves: 18, lastPlayed: null },
};

/**
 * Unified keyboard layout shared by the mock engines. Real engines keep their
 * own defaults; the browser preview only needs representative data.
 */
const MOCK_KEYBOARD: KeyboardBindings = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  a: 'KeyJ',
  b: 'KeyK',
  x: 'KeyU',
  y: 'KeyI',
  l: 'KeyQ',
  r: 'KeyE',
  start: 'Enter',
  select: 'ShiftRight',
};

const MOCK_ENGINES = ['mgba', 'ares', 'dolphin', 'azahar', 'melonds'] as const;

function demoGames(): Record<string, GameRecord[]> {
  const mk = (id: string, systemId: string, title: string, size: number, minutesAgo: number): GameRecord => ({
    id,
    systemId,
    path: `C:\\ROMs\\${systemId}\\${title}.gba`,
    fileName: `${title}.gba`,
    title,
    size,
    sha1: id.padEnd(40, '0'),
    addedAt: Date.now() - 86_400_000,
    lastPlayed: minutesAgo > 0 ? Date.now() - minutesAgo * 60_000 : null,
  });
  return {
    gba: [
      mk('a1', 'gba', 'Golden Sun', 8_388_608, 120),
      mk('a2', 'gba', 'Metroid Fusion', 8_388_608, 2880),
      mk('a3', 'gba', 'Advance Wars', 4_194_304, 0),
      mk('a4', 'gba', 'Fire Emblem', 8_388_608, 0),
      mk('a5', 'gba', 'Mario Kart Super Circuit', 4_194_304, 10080),
    ],
  };
}

export function installMockApi(): void {
  let listener: ((event: LaunchEvent) => void) | null = null;
  const favorites = new Set<string>();
  const games = demoGames();
  const controlOverrides: Record<string, EngineControls> = {};

  let settings: Settings = {
    minimizeOnLaunch: true,
    fullscreen: false,
    autoScan: true,
    scanRoots: ['D:\\ROMs', 'D:\\Games\\GBA'],
  };

  const controlsPayload = (): ControlsPayload => {
    const engines: ControlsPayload['engines'] = {};
    for (const engineId of MOCK_ENGINES) {
      const override = controlOverrides[engineId];
      const keyboard = override?.keyboard ?? {};
      engines[engineId] = {
        engineId,
        // ares' settings.bml encoding is not decoded yet, so its group is read-only.
        supported: engineId !== 'ares',
        mode: override?.mode ?? 'keyboard',
        current: { ...MOCK_KEYBOARD, ...keyboard },
        isCustom: Object.keys(keyboard).length > 0,
      };
    }
    return { engines };
  };

  const payload = (): HomePayload => ({
    version: '0.1.0-mock',
    families: FAMILIES.map((family) => ({
      id: family.id,
      name: family.name,
      locked: family.locked,
      systems: systemsOf(family.id).map((system) => ({
        ...system,
        games: games[system.id]?.length ?? STATS[system.id]?.games ?? 0,
        saves: STATS[system.id]?.saves ?? 0,
        lastPlayed: STATS[system.id]?.lastPlayed ?? null,
        favorite: favorites.has(system.id),
      })),
    })),
    engines: [],
  });

  const api: NestApi = {
    info: async () => ({ version: '0.1.0-mock', platform: 'browser', electron: '-', node: '-' }),
    firmwareStatus: async () => [
      { kind: 'gc-ipl', label: 'GameCube IPL（系统菜单）', status: 'missing', path: null },
      { kind: 'wii-menu', label: 'Wii 系统菜单 WAD', status: 'missing', path: null },
    ],
    pickFirmware: async () => ({ ok: true, canceled: true }),
    home: async () => payload(),
    games: async (systemId) => games[systemId] ?? [],
    scan: async (systemId, path) => {
      if (!systemId) {
        const root = path ?? 'D:\\ROMs\\New';
        if (!(settings.scanRoots ?? []).includes(root)) {
          settings = { ...settings, scanRoots: [...(settings.scanRoots ?? []), root] };
        }
        return { ok: true, root, added: 1, skipped: 0, total: 1 };
      }
      const list = games[systemId] ?? (games[systemId] = []);
      const before = list.length;
      list.unshift({
        id: `s${Math.random().toString(36).slice(2, 8)}`,
        systemId,
        path: `C:\\ROMs\\${systemId}\\Demo ${before + 1}.gba`,
        fileName: `Demo ${before + 1}.gba`,
        title: `Demo ${before + 1}`,
        size: 4_194_304,
        sha1: 'f'.repeat(40),
        addedAt: Date.now(),
        lastPlayed: null,
      });
      return { ok: true, root: 'C:\\ROMs', added: 1, skipped: 0, total: 1 };
    },
    launch: async (systemId: string, _mode: LaunchMode = 'game', rom?: string) => {
      const emit = (state: LaunchEvent['state'], code: number | null = null) =>
        listener?.({ sessionId: 'mock', systemId, state, code, at: Date.now() });
      emit('starting');
      setTimeout(() => emit('running'), 120);
      setTimeout(() => {
        const played = (games[systemId] ?? []).find((g) => g.path === rom);
        if (played) played.lastPlayed = Date.now();
        emit('exited', 0);
      }, 2200);
      return { ok: true, sessionId: 'mock' };
    },
    removeGame: async (gameId) => {
      for (const key of Object.keys(games)) {
        games[key] = games[key].filter((g) => g.id !== gameId);
      }
      return { ok: true };
    },
    stop: async () => ({ ok: true }),
    rescan: async () => ({ ok: true, root: '', added: 0, skipped: 0, total: 0 }),
    removeScanRoot: async (root) => {
      settings = {
        ...settings,
        scanRoots: (settings.scanRoots ?? []).filter((item) => item !== root),
      };
      return { ok: true };
    },
    onLibraryChanged: () => () => undefined,
    settings: async () => ({ ...settings, scanRoots: [...(settings.scanRoots ?? [])] }),
    saveSettings: async (patch) => {
      settings = { ...settings, ...patch };
      return { ok: true, settings: { ...settings } };
    },
    favorite: async (systemId, favorite) => {
      if (favorite) favorites.add(systemId);
      else favorites.delete(systemId);
      return { ok: true };
    },
    controls: async () => controlsPayload(),
    saveControls: async (engineId, controls) => {
      controlOverrides[engineId] = { ...controls, updatedAt: Date.now() };
      return { ok: true, applied: ['mock'] };
    },
    resetControls: async (engineId) => {
      delete controlOverrides[engineId];
      return { ok: true };
    },
    openHomepage: async () => ({ ok: true }),
    onLaunchEvent: (cb) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  };

  window.nest = api;
}
