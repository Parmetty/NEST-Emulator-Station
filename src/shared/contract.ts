import { z } from 'zod';
import type { FamilyId, SystemDef } from './systems';

/* ------------------------------------------------------------ IPC names */
export const CH = {
  info: 'nest:info',
  home: 'nest:home',
  engines: 'nest:engines',
  games: 'nest:games',
  scan: 'nest:scan',
  removeGame: 'nest:remove-game',
  settings: 'nest:settings',
  saveSettings: 'nest:settings-save',
  launch: 'nest:launch',
  stop: 'nest:stop',
  favorite: 'nest:favorite',
  openHomepage: 'nest:open-homepage',
  launchEvent: 'nest:launch-event',
  libraryChanged: 'nest:library-changed',
  rescan: 'nest:rescan',
  removeScanRoot: 'nest:scan-root-remove',
  controls: 'nest:controls',
  saveControls: 'nest:controls-save',
  resetControls: 'nest:controls-reset',
  firmwareStatus: 'nest:firmware-status',
  pickFirmware: 'nest:pick-firmware',
} as const;

/* ------------------------------------------------------------- firmware */
export type FirmwareKind = 'gc-ipl' | 'wii-menu' | 'nds-bios';

export type FirmwareState = {
  kind: FirmwareKind;
  label: string;
  /** 'missing' | 'ok' | 'invalid' — invalid means the checksum/format was rejected. */
  status: 'missing' | 'ok' | 'invalid';
  /** Resolved path when present, for display. */
  path: string | null;
  /** Human readable detail, e.g. "USA / CRC32 86573808". */
  detail?: string;
};

/* ------------------------------------------------------------- schemas */
export const launchModeSchema = z.enum(['game', 'system']);

export const launchRequestSchema = z.object({
  systemId: z.string().min(1).max(32),
  mode: launchModeSchema.default('game'),
  /** Absolute path of the ROM to boot. Empty means "boot the engine as-is". */
  rom: z.string().max(4096).optional(),
});

export const scanRequestSchema = z.object({
  systemId: z.string().min(1).max(32).optional(),
  /** When omitted the main process opens a folder picker. */
  path: z.string().max(4096).optional(),
});

export const gamesRequestSchema = z.object({
  systemId: z.string().min(1).max(32),
});

const keyCodeSchema = z.string().min(1).max(24);
export const settingsSchema = z.object({
  minimizeOnLaunch: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
  /** Scan the folders below automatically when Nest starts. */
  autoScan: z.boolean().optional(),
  /** Absolute folders the user added; re-scanned at boot and on demand. */
  scanRoots: z.array(z.string().min(1)).max(32).optional(),
  controls: z
    .record(
      z.string().max(32),
      z.object({
        mode: z.enum(['keyboard', 'gamepad']).optional(),
        keyboard: z.record(z.string().max(24), keyCodeSchema).optional(),
        updatedAt: z.number().optional(),
      }),
    )
    .optional(),
});

export const favoriteRequestSchema = z.object({
  systemId: z.string().min(1).max(32),
  favorite: z.boolean(),
});

export const engineManifestSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1),
  systems: z.array(z.string().min(1)).min(1),
  kind: z.enum(['native', 'node']),
  /** For kind=node: script path relative to the app folder. */
  script: z.string().optional(),
  detect: z.object({ paths: z.array(z.string()).default([]) }).default({ paths: [] }),
  download: z.object({ homepage: z.string().min(1) }).optional(),
  launch: z.object({
    args: z.array(z.string()).default([]),
    /** Extra args used when booting the real system menu instead of a game. */
    systemArgs: z.array(z.string()).default([]),
    /** Flag prepended when the user asks for fullscreen, e.g. "-f" for mGBA. */
    fullscreenFlag: z.string().optional(),
    /** Flag used for one-shot config overrides, e.g. "-C" for mGBA. */
    configFlag: z.string().optional(),
    /** Config key that redirects screenshots, e.g. "screenshotPath". */
    screenshotPathOption: z.string().optional(),
    cwd: z.enum(['engineDir', 'appDir']).default('engineDir'),
  }),
  capabilities: z
    .object({
      saveStates: z.boolean().default(false),
      systemMode: z.string().nullable().default(null),
    })
    .default({ saveStates: false, systemMode: null }),

  /**
   * Width/height of the emulated screen inside the window, used to crop cover
   * captures. Omit when the client area already is the screen (ares with the
   * status bar disabled, Dolphin), so no cropping happens.
   */
  captureAspect: z.number().positive().optional(),

  /**
   * Which edge the emulated screen is anchored to when captureAspect crops
   * chrome: qt-style frontends keep a menu bar at the top (default "bottom"),
   * ares keeps a status bar at the bottom ("top").
   */
  captureAnchor: z.enum(['top', 'bottom']).optional(),

  /**
   * Pixels of frontend chrome to drop from the client area, in 96-DPI units
   * (the capture tool scales them by the window's DPI). Qt frontends such as
   * Azahar draw a menu bar on top and a status bar at the bottom; a single
   * `captureAspect` can only trim one edge.
   */
  captureCropTop: z.number().int().nonnegative().optional(),
  captureCropBottom: z.number().int().nonnegative().optional(),

  /**
   * Ignore windows smaller than this client height when capturing a cover.
   * Guards against emulator warning/error dialogs becoming the cover when the
   * real game window never appears (Dolphin shows a 124 px warning dialog).
   */
  captureMinHeight: z.number().int().positive().optional(),

  /**
   * Aspect of the emulated screen inside the client area (width / height).
   * The capture centre-crops to it, which removes letterbox bars the frontend
   * adds by making its window wider than the game (Azahar with two screens).
   */
  captureContentAspect: z.number().positive().optional(),

  /** Keep only the top half of the captured screen (3DS: top screen only). */
  captureTopOnly: z.boolean().optional(),

  /**
   * System mode reached through the engine's own GUI: wait for the window, then
   * open a known top-level menu and invoke the target item.
   */
  /** System-mode launch arguments that differ per console (Dolphin: GC via GUI, Wii via WAD). */
  systemArgsBySystem: z.record(z.array(z.string())).optional(),

  systemBoot: z
    .object({
      /** Keyboard path (needs foreground; used when UI Automation is not an option). */
      keys: z.string().optional(),
      /** Top-level menu label, e.g. "工具" / "Tools". Enables the fast path. */
      top: z.string().optional(),
      /** Submenu label, e.g. "GameCube". */
      menu: z.string().optional(),
      /** Item label inside that submenu, e.g. "NTSC-U". */
      item: z.string().optional(),
      /** Launcher window title filter, e.g. "Dolphin". */
      title: z.string().optional(),
      /** Emulation window title fragment, e.g. "JIT64". */
      renderTitle: z.string().optional(),
      delay: z.number().int().nonnegative().optional(),
      step: z.number().int().nonnegative().optional(),
      minimize: z.boolean().optional(),
    })
    .refine((value) => value.keys || value.menu, {
      message: 'systemBoot needs keys or a menu path',
    })
    .optional(),
});

export type EngineManifest = z.infer<typeof engineManifestSchema>;

/* --------------------------------------------------------------- views */
export type LaunchMode = z.infer<typeof launchModeSchema>;

export interface SystemView extends SystemDef {
  games: number;
  saves: number;
  lastPlayed: string | null;
  favorite: boolean;
}

export interface FamilyView {
  id: FamilyId;
  name: string;
  locked: boolean;
  systems: SystemView[];
}

export interface EngineStatus {
  id: string;
  name: string;
  systems: string[];
  detected: boolean;
  path: string | null;
  systemMode: string | null;
  homepage: string | null;
}

export interface HomePayload {
  families: FamilyView[];
  engines: EngineStatus[];
  version: string;
}

export interface LaunchResult {
  ok: boolean;
  sessionId?: string;
  error?: string;
}

export type LaunchState = 'starting' | 'running' | 'exited' | 'crashed' | 'refused';

export interface GameRecord {
  /** sha1 of the file, first 16 chars. Stable id across scans. */
  id: string;
  systemId: string;
  path: string;
  fileName: string;
  title: string;
  size: number;
  sha1: string;
  addedAt: number;
  lastPlayed: number | null;
  /** File name inside <userData>/covers, captured from the last session. */
  cover?: string | null;
  coverAt?: number | null;
  /** data: URL injected by the main process when the cover exists on disk. */
  coverUrl?: string | null;
}

export interface ScanResult {
  ok: boolean;
  root?: string;
  added?: number;
  skipped?: number;
  total?: number;
  error?: string;
}

/* ------------------------------------------------------------- controls */

export const PAD_ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select'] as const;

export type PadAction = (typeof PAD_ACTIONS)[number];

/** A `KeyboardEvent.code` value, e.g. "KeyW", "ArrowUp", "Space", "ShiftRight". */
export type KeyCode = string;

export type KeyboardBindings = Partial<Record<PadAction, KeyCode>>;

export interface EngineControls {
  mode?: 'keyboard' | 'gamepad';
  keyboard?: KeyboardBindings;
  updatedAt?: number;
}

export interface EngineControlsView {
  engineId: string;
  supported: boolean;
  mode: 'keyboard' | 'gamepad';
  current: KeyboardBindings;
  isCustom: boolean;
}

export interface ControlsPayload {
  engines: Record<string, EngineControlsView>;
}
export interface Settings {
  minimizeOnLaunch: boolean;
  fullscreen: boolean;
  autoScan?: boolean;
  scanRoots?: string[];
  /** Per-engine key overrides written by the key-mapping panel. */
  controls?: Record<string, EngineControls>;
}

export interface LaunchEvent {
  sessionId: string;
  systemId: string;
  /** Set when the session was started for a specific library game. */
  gameId?: string | null;
  state: LaunchState;
  code?: number | null;
  message?: string;
  at: number;
}
