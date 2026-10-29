import { contextBridge, ipcRenderer } from 'electron';
import {
  CH,
  type ControlsPayload,
  type EngineControls,
  type GameRecord,
  type HomePayload,
  type LaunchEvent,
  type LaunchMode,
  type LaunchResult,
  type ScanResult,
  type FirmwareKind,
  type FirmwareState,
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

  rescan: (): Promise<ScanResult> => ipcRenderer.invoke(CH.rescan),

  removeScanRoot: (root: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(CH.removeScanRoot, { root }),

  settings: (): Promise<Settings> => ipcRenderer.invoke(CH.settings),

  saveSettings: (patch: Partial<Settings>): Promise<{ ok: boolean; settings?: Settings }> =>
    ipcRenderer.invoke(CH.saveSettings, patch),

  favorite: (systemId: string, favorite: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.favorite, { systemId, favorite }),

  controls: (): Promise<ControlsPayload> => ipcRenderer.invoke(CH.controls),

  saveControls: (
    engineId: string,
    controls: EngineControls,
  ): Promise<{ ok: boolean; applied?: string[]; error?: string }> =>
    ipcRenderer.invoke(CH.saveControls, { engineId, controls }),

  resetControls: (engineId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(CH.resetControls, { engineId }),

  firmwareStatus: (): Promise<FirmwareState[]> => ipcRenderer.invoke(CH.firmwareStatus),

  pickFirmware: (
    kind: FirmwareKind,
  ): Promise<{ ok: boolean; canceled?: boolean; error?: string; state?: FirmwareState }> =>
    ipcRenderer.invoke(CH.pickFirmware, { kind }),

  openHomepage: (url: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.openHomepage, { url }),

  onLibraryChanged: (cb: (info: { roots: number; added: number }) => void): (() => void) => {
    const handler = (_e: unknown, info: { roots: number; added: number }) => cb(info);
    ipcRenderer.on(CH.libraryChanged, handler);
    return () => ipcRenderer.removeListener(CH.libraryChanged, handler);
  },

  onLaunchEvent: (cb: (event: LaunchEvent) => void): (() => void) => {
    const handler = (_e: unknown, event: LaunchEvent) => cb(event);
    ipcRenderer.on(CH.launchEvent, handler);
    return () => ipcRenderer.removeListener(CH.launchEvent, handler);
  },
};

contextBridge.exposeInMainWorld('nest', api);

export type NestApi = typeof api;
