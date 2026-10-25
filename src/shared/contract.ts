import { z } from 'zod';
import type { FamilyId, SystemDef } from './systems';

/* ------------------------------------------------------------ IPC names */
export const CH = {
  info: 'nest:info',
  home: 'nest:home',
  engines: 'nest:engines',
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

export interface LaunchEvent {
  sessionId: string;
  systemId: string;
  state: LaunchState;
  code?: number | null;
  message?: string;
  at: number;
}
