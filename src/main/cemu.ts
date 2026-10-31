/**
 * Cemu / Wii U helpers (pure Node, no Electron, so they are unit-testable).
 *
 * Cemu 2.6 runs in portable mode (the `portable/` folder ships next to the exe),
 * so its decryption keys live in `<engines>/cemu/portable/keys.txt`. The Wii U
 * NAND/MLC is user-owned and stays wherever the user dumped it: Nest only stores
 * the path in settings and passes it via `-m`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Wii U Menu title id (Cemu `-t` target for "boot the system menu"). */
export const WIIU_MENU_TITLE_ID = '0005001010040000';

export function cemuEngineDir(enginesDir: string): string {
  return path.join(enginesDir, 'cemu');
}

/** `portable/keys.txt` next to Cemu.exe (portable mode). */
export function cemuKeysPath(enginesDir: string): string {
  return path.join(cemuEngineDir(enginesDir), 'portable', 'keys.txt');
}

/** Count valid Cemu key lines: 32 hex chars, `#` starts a comment. */
export function countCemuKeys(text: string): number {
  let count = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (/^[0-9a-fA-F]{32}$/.test(line)) count += 1;
  }
  return count;
}

export interface CemuKeysImport {
  ok: boolean;
  /** Number of valid key lines found in the source file. */
  keys: number;
  error?: 'missing-cemu-keys' | 'io-error';
  /** First-time backup of the previous keys.txt, when one existed. */
  backup?: string;
  path: string;
}

/**
 * Copy a user-supplied keys.txt into Cemu's portable folder. A file without a
 * single 32-hex key line is rejected (importing it would only break Cemu);
 * the previous file is backed up once as `keys.txt.before-nest`.
 */
export function copyCemuKeys(source: string, target: string): CemuKeysImport {
  let text = '';
  try {
    text = readFileSync(source, 'utf8');
  } catch {
    return { ok: false, keys: 0, error: 'io-error', path: target };
  }
  const keys = countCemuKeys(text);
  if (keys === 0) return { ok: false, keys: 0, error: 'missing-cemu-keys', path: target };

  let backup: string | undefined;
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    if (existsSync(target)) {
      const previous = `${target}.before-nest`;
      if (!existsSync(previous)) {
        copyFileSync(target, previous);
        backup = previous;
      }
    }
    writeFileSync(target, text, 'utf8');
  } catch {
    return { ok: false, keys, error: 'io-error', path: target };
  }
  return { ok: true, keys, backup, path: target };
}

/**
 * A folder counts as a Wii U NAND/MLC when it has the Wii U Menu title
 * (`sys/title/00050010/10040000`) or the `usr/` tree Cemu needs.
 */
export function isValidWiiuMlc(dir: string): boolean {
  if (!dir) return false;
  try {
    if (!statSync(dir).isDirectory()) return false;
    if (existsSync(path.join(dir, 'sys', 'title', '00050010', WIIU_MENU_TITLE_ID))) return true;
    return existsSync(path.join(dir, 'usr'));
  } catch {
    return false;
  }
}

export interface CemuLaunchInput {
  mode: 'game' | 'system';
  /** `settings.cemuMlc` (absolute path) or null. */
  mlc: string | null;
  /** Manifest args after placeholder expansion (e.g. ["-g", "<rom>"] / ["-t", id]). */
  args: string[];
}

export interface CemuLaunchResult {
  ok: boolean;
  args: string[];
  error?: 'missing-wiiu-mlc' | 'invalid-wiiu-mlc';
}

/**
 * Insert the user's MLC path (`-m <dir>`) in front of the game/system argument
 * list. Booting the Wii U Menu is refused without a usable NAND — Cemu would
 * otherwise fall back to its own empty one and show an error dialog.
 */
export function applyCemuLaunchOptions(input: CemuLaunchInput): CemuLaunchResult {
  const mlc = input.mlc?.trim() ? input.mlc.trim() : null;
  if (!mlc) {
    if (input.mode === 'system') return { ok: false, args: input.args, error: 'missing-wiiu-mlc' };
    return { ok: true, args: input.args };
  }
  if (!isValidWiiuMlc(mlc)) return { ok: false, args: input.args, error: 'invalid-wiiu-mlc' };
  return { ok: true, args: ['-m', mlc, ...input.args] };
}
