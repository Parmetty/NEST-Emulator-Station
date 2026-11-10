/**
 * RPCS3 engine-level helpers shared by the IPC layer.
 *
 * Nest keeps RPCS3 in portable mode, so `config/` and `cache/` live next to
 * `rpcs3.exe`. The renderer choice is one line in `config/config.yml`
 * (`[Video] Renderer`). Switching renderer only rewrites that line: both
 * renderers' precompiled files stay on disk on purpose, because RPCS3 rebuilds
 * only what it needs and a player may switch back. Nothing here deletes cache
 * content.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { backupOnce } from './controls/util';

export type Rpcs3Renderer = 'vulkan' | 'opengl';

export function rpcs3EngineDir(enginesDir: string): string {
  return path.join(enginesDir, 'rpcs3');
}

export function rpcs3ConfigPath(engineDir: string): string {
  return path.join(engineDir, 'config', 'config.yml');
}

/** Where RPCS3 keeps compiled PPU/SPU modules and per-game shader caches. */
export function rpcs3CacheDir(engineDir: string): string {
  return path.join(engineDir, 'cache');
}

/** Copies the shipped seed config once; later launches keep the player's file. */
export function ensureRpcs3Config(engineDir: string): string | null {
  const file = rpcs3ConfigPath(engineDir);
  if (existsSync(file)) return file;
  const seed = path.join(engineDir, 'seed', 'config.yml');
  if (!existsSync(seed)) return null;
  mkdirSync(path.dirname(file), { recursive: true });
  copyFileSync(seed, file);
  return file;
}

export function readRpcs3Renderer(engineDir: string): Rpcs3Renderer | null {
  const file = rpcs3ConfigPath(engineDir);
  if (!existsSync(file)) return null;
  const match = /^\s*Renderer:\s*(Vulkan|OpenGL)\s*$/m.exec(readFileSync(file, 'utf8'));
  return match ? (match[1].toLowerCase() as Rpcs3Renderer) : null;
}

export interface Rpcs3RendererResult {
  ok: boolean;
  path: string;
  changed: boolean;
}

/**
 * Writes the requested renderer into `[Video] Renderer`. Only the Vulkan/OpenGL
 * line is touched (the audio renderer is `Cubeb`), and no cache directory is
 * read, moved or removed.
 */
export function applyRpcs3Renderer(engineDir: string, renderer: Rpcs3Renderer): Rpcs3RendererResult {
  const value = renderer === 'vulkan' ? 'Vulkan' : 'OpenGL';
  const file = ensureRpcs3Config(engineDir);
  if (!file) return { ok: false, path: rpcs3ConfigPath(engineDir), changed: false };
  const text = readFileSync(file, 'utf8');
  const next = text.replace(/^(\s*Renderer:\s*)(Vulkan|OpenGL)(\s*)$/gm, (_m, head: string, _old: string, tail: string) => `${head}${value}${tail}`);
  const changed = next !== text;
  if (changed) {
    backupOnce(file);
    writeFileSync(file, next, 'utf8');
  }
  return { ok: true, path: file, changed };
}
