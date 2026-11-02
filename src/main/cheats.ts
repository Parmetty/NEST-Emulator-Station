/**
 * GBA cheat files (mGBA `.cheats` format).
 *
 * mGBA auto-loads `<rom name without extension>.cheats` next to the ROM, so the
 * natural place for Nest to keep cheats is exactly that sidecar file. When the
 * library folder is read-only we fall back to `<userData>/cheats/<hash>.cheats`
 * and hand it to mGBA with `-c` at launch instead.
 *
 * The file body is plain text in mGBA's own format; it accepts raw code lines,
 * `!PARv3` directives, comments (`#`) and inline `!disabled` markers.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Guard against accidentally pasting a whole ROM dump into the panel. */
export const MAX_CHEAT_BYTES = 64 * 1024;

/** Placeholder text shown when a game has no cheats yet. */
export const CHEAT_TEMPLATE = `# 一行一条，mGBA 会自动识别格式
# GameShark:  02025BC4:000F423F
# CodeBreaker: 82000000 0000
# !PARv3
# C518E259 5ADBAF5B
`;

export function cheatSidecarPath(romPath: string): string {
  const dir = path.dirname(romPath);
  const base = path.basename(romPath, path.extname(romPath));
  return path.join(dir, `${base}.cheats`);
}

export function managedCheatPath(userData: string, romPath: string): string {
  const hash = createHash('sha1').update(romPath.toLowerCase()).digest('hex').slice(0, 16);
  return path.join(userData, 'cheats', `${hash}.cheats`);
}

/** LF line endings, trailing whitespace removed, exactly one trailing newline. */
export function normalizeCheatText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

export interface CheatFile {
  path: string;
  text: string;
  /** True when the file lives under `<userData>/cheats` instead of the ROM folder. */
  managed: boolean;
  exists: boolean;
}

function readIfExists(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function readCheatFile(romPath: string, userData: string): CheatFile {
  const sidecar = cheatSidecarPath(romPath);
  const sidecarText = readIfExists(sidecar);
  if (sidecarText !== null) {
    return { path: sidecar, text: sidecarText, managed: false, exists: true };
  }
  const managed = managedCheatPath(userData, romPath);
  const managedText = readIfExists(managed);
  if (managedText !== null) {
    return { path: managed, text: managedText, managed: true, exists: true };
  }
  return { path: sidecar, text: '', managed: false, exists: false };
}

export interface CheatSaveResult {
  ok: boolean;
  path: string;
  managed: boolean;
  error?: string;
}

/** Writes the sidecar first; falls back to the managed folder if the ROM dir is read-only. */
export function saveCheatText(romPath: string, userData: string, text: string): CheatSaveResult {
  const body = normalizeCheatText(text);
  if (body.length > MAX_CHEAT_BYTES) {
    return { ok: false, path: '', managed: false, error: 'too-large' };
  }
  const sidecar = cheatSidecarPath(romPath);
  try {
    writeFileSync(sidecar, body, 'utf8');
    return { ok: true, path: sidecar, managed: false };
  } catch {
    // fall through to the managed copy
  }
  const managed = managedCheatPath(userData, romPath);
  try {
    mkdirSync(path.dirname(managed), { recursive: true });
    writeFileSync(managed, body, 'utf8');
    return { ok: true, path: managed, managed: true };
  } catch (err) {
    return { ok: false, path: '', managed: false, error: (err as Error).message };
  }
}

/**
 * mGBA reads sidecars by itself; only a managed copy has to be passed with `-c`.
 * Options must come before the ROM positional argument.
 */
export function cheatExtraArgs(
  engineId: string,
  mode: string,
  rom: string | undefined,
  userData: string,
): string[] {
  if (engineId !== 'mgba' || mode !== 'game' || !rom) return [];
  // The sidecar next to the ROM wins: mGBA loads it without any CLI switch.
  if (existsSync(cheatSidecarPath(rom))) return [];
  const managed = managedCheatPath(userData, rom);
  if (!existsSync(managed)) return [];
  return ['-c', managed];
}
