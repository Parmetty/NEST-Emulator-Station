import { FAMILIES, systemsOf } from '@shared/systems';
import type { HomePayload, LaunchEvent, LaunchMode } from '@shared/contract';
import type { NestApi } from './env';

/**
 * Browser-only fallback: lets the real renderer run without Electron, which is
 * how we review the UI (and how `vite dev` works on machines where the window
 * can't start). The Electron build always provides the real IPC bridge, so this
 * is never used there.
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

export function installMockApi(): void {
  let listener: ((event: LaunchEvent) => void) | null = null;
  const favorites = new Set<string>();

  const payload = (): HomePayload => ({
    version: '0.1.0-mock',
    families: FAMILIES.map((family) => ({
      id: family.id,
      name: family.name,
      locked: family.locked,
      systems: systemsOf(family.id).map((system) => ({
        ...system,
        games: STATS[system.id]?.games ?? 0,
        saves: STATS[system.id]?.saves ?? 0,
        lastPlayed: STATS[system.id]?.lastPlayed ?? null,
        favorite: favorites.has(system.id),
      })),
    })),
    engines: [],
  });

  const api: NestApi = {
    info: async () => ({ version: '0.1.0-mock', platform: 'browser', electron: '-', node: '-' }),
    home: async () => payload(),
    launch: async (systemId: string, mode: LaunchMode = 'game') => {
      const emit = (state: LaunchEvent['state'], code: number | null = null) =>
        listener?.({ sessionId: 'mock', systemId, state, code, at: Date.now() });
      emit('starting');
      setTimeout(() => emit('running'), 120);
      setTimeout(() => emit('exited', 0), 2200);
      void mode;
      return { ok: true, sessionId: 'mock' };
    },
    stop: async () => ({ ok: true }),
    favorite: async (systemId, favorite) => {
      if (favorite) favorites.add(systemId);
      else favorites.delete(systemId);
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
