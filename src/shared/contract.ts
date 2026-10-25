import { z } from 'zod';
import type { FamilyId, SystemDef } from './systems';

/* ------------------------------------------------------------ IPC names */
export const CH = {
  info: 'nest:info',
  home: 'nest:home',
  engines: 'nest:engines',
  games: 'nest:games',
  scan: 'nest:scan',
  settings: 'nest:settings',
  saveSettings: 'nest:settings-save',
  launch: 'nest:launch',
  stop: 'nest:stop',
  favorite: 'nest:favorite',
  openHomepage: 'nest:open-homepage',
  launchEvent: 'nest:launch-event',
} as const;

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

export const settingsSchema = z.object({
  minimizeOnLaunch: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
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
    cwd: z.enum(['engineDir', 'appDir']).default('engineDir'),
  }),
  capabilities: z
    .object({
      saveStates: z.boolean().default(false),
      systemMode: z.string().nullable().default(null),
    })
    .default({ saveStates: false, systemMode: null }),
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
}

export interface ScanResult {
  ok: boolean;
  root?: string;
  added?: number;
  skipped?: number;
  total?: number;
  error?: string;
}

export interface Settings {
  minimizeOnLaunch: boolean;
  fullscreen: boolean;
}

export interface LaunchEvent {
  sessionId: string;
  systemId: string;
  state: LaunchState;
  code?: number | null;
  message?: string;
  at: number;
}
