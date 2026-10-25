import { contextBridge, ipcRenderer } from 'electron';
import {
  CH,
  type HomePayload,
  type LaunchEvent,
  type LaunchMode,
  type LaunchResult,
} from '../shared/contract';

const api = {
  info: (): Promise<{ version: string; platform: string; electron: string; node: string }> =>
    ipcRenderer.invoke(CH.info),

  home: (): Promise<HomePayload> => ipcRenderer.invoke(CH.home),

  launch: (systemId: string, mode: LaunchMode = 'game'): Promise<LaunchResult> =>
    ipcRenderer.invoke(CH.launch, { systemId, mode }),

  stop: (sessionId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.stop, { sessionId }),

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
