import type { HomePayload, LaunchEvent, LaunchMode, LaunchResult } from '@shared/contract';

export interface NestApi {
  info(): Promise<{ version: string; platform: string; electron: string; node: string }>;
  home(): Promise<HomePayload>;
  launch(systemId: string, mode?: LaunchMode): Promise<LaunchResult>;
  stop(sessionId: string): Promise<{ ok: boolean }>;
  favorite(systemId: string, favorite: boolean): Promise<{ ok: boolean }>;
  openHomepage(url: string): Promise<{ ok: boolean }>;
  onLaunchEvent(cb: (event: LaunchEvent) => void): () => void;
}

declare global {
  interface Window {
    nest: NestApi;
    /** Set by the renderer once the home payload is on screen; the smoke test watches this. */
    __NEST_READY__?: boolean;
  }
}

export {};
