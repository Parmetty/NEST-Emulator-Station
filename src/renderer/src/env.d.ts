import type {
  ControlsPayload,
  EngineControls,
  FirmwareKind,
  FirmwareState,
  GbaCheatFile,
  GameRecord,
  HomePayload,
  LaunchEvent,
  LaunchMode,
  LaunchResult,
  ScanResult,
  Settings,
} from '@shared/contract';

export interface NestApi {
  info(): Promise<{ version: string; platform: string; electron: string; node: string }>;
  home(): Promise<HomePayload>;
  games(systemId: string): Promise<GameRecord[]>;
  scan(systemId?: string, path?: string): Promise<ScanResult>;
  removeGame(gameId: string): Promise<{ ok: boolean; error?: string }>;
  renameGame(gameId: string, title: string): Promise<{ ok: boolean; error?: string; game?: GameRecord }>;
  launch(systemId: string, mode?: LaunchMode, rom?: string): Promise<LaunchResult>;
  stop(sessionId: string): Promise<{ ok: boolean }>;
  rescan(): Promise<ScanResult>;
  removeScanRoot(root: string): Promise<{ ok: boolean; error?: string }>;
  settings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<{ ok: boolean; settings?: Settings }>;
  favorite(systemId: string, favorite: boolean): Promise<{ ok: boolean }>;
  pickCover(gameId: string): Promise<{ ok: boolean; canceled?: boolean; game?: GameRecord; error?: string }>;
  clearCover(gameId: string): Promise<{ ok: boolean; game?: GameRecord; error?: string }>;
  packXboxIso(gameId: string, target?: string): Promise<{ ok: boolean; game?: GameRecord; error?: string }>;
  pickXboxIsoPath(
    gameId: string,
  ): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  controls(): Promise<ControlsPayload>;
  saveControls(
    engineId: string,
    controls: EngineControls,
  ): Promise<{ ok: boolean; applied?: string[]; error?: string }>;
  resetControls(engineId: string): Promise<{ ok: boolean; error?: string }>;
  gbaCheats(rom: string): Promise<GbaCheatFile>;
  gbaCheatsSave(rom: string, text: string): Promise<GbaCheatFile>;
  firmwareStatus(): Promise<FirmwareState[]>;
  pickFirmware(
    kind: FirmwareKind,
  ): Promise<{ ok: boolean; canceled?: boolean; error?: string; state?: FirmwareState }>;
  openHomepage(url: string): Promise<{ ok: boolean }>;
  openPpsspp(): Promise<{ ok: boolean; error?: string }>;
  openPs3Cache(): Promise<{ ok: boolean; path?: string; error?: string }>;
  onLibraryChanged(cb: (info: { roots: number; added: number }) => void): () => void;
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
