import { contextBridge, ipcRenderer } from 'electron';
import {
  CH,
  type GameRecord,
  type HomePayload,
  type LaunchEvent,
  type LaunchMode,
  type LaunchResult,
  type ScanResult,
  type Settings,
} from '../shared/contract';

const api = {
  info: (): Promise<{ version: string; platform: string; electron: string; node: string }> =>
    ipcRenderer.invoke(CH.info),

  home: (): Promise<HomePayload> => ipcRenderer.invoke(CH.home),

  games: (systemId: string): Promise<GameRecord[]> => ipcRenderer.invoke(CH.games, { systemId }),

  scan: (systemId?: string, path?: string): Promise<ScanResult> =>
    ipcRenderer.invoke(CH.scan, { systemId, path }),

  removeGame: (gameId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(CH.removeGame, { gameId }),

  launch: (systemId: string, mode: LaunchMode = 'game', rom?: string): Promise<LaunchResult> =>
    ipcRenderer.invoke(CH.launch, { systemId, mode, rom }),

  stop: (sessionId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(CH.stop, { sessionId }),

  settings: (): Promise<Settings> => ipcRenderer.invoke(CH.settings),

  saveSettings: (patch: Partial<Settings>): Promise<{ ok: boolean; settings?: Settings }> =>
    ipcRenderer.invoke(CH.saveSettings, patch),

  favorite: (systemId: string, favorite: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.favorite, { systemId, favorite }),

  openHomepage: (url: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.openHomepage, { url }),

  onLaunchEvent: (cb: (event: LaunchEvent) => void): (() => void) => {
    const handler = (_e: unknown, event: LaunchEvent) => cb(event);
    ipcRenderer.on(CH.launchEvent, handler);
    return () => ipcRenderer.removeListener(CH.launchEvent, handler);
  },
};

contextBridge.exposeInMainWorld('nest', api);

export type NestApi = typeof api;
