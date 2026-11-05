/**
 * PPSSPP integration helpers.
 *
 * PPSSPP runs in portable mode when `portable.txt` sits next to the exe; all
 * configuration, memory stick, savestates and installed PSP firmware then live
 * under `<engineDir>/memstick`. Nest keeps that next to the bundled engine and
 * strips it from the portable zip.
 *
 * XMB (system mode) needs a PSP firmware installed by PPSSPP itself; that means
 * `memstick/PSP/NAND/flash0/vsh/module/vshmain.prx`.
 *
 * Users can point Nest at a decrypted `flash0` folder (from their own PSP, or
 * from an existing PPSSPP install); Nest links it in place instead of making
 * them install again through PPSSPP's GUI.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export function ppssppEngineDir(enginesDir: string): string {
  return path.join(enginesDir, 'ppsspp');
}

export function ppssppMemstick(enginesDir: string): string {
  return path.join(ppssppEngineDir(enginesDir), 'memstick');
}

export function ppssppControlsPath(enginesDir: string): string {
  return path.join(ppssppMemstick(enginesDir), 'PSP', 'SYSTEM', 'controls.ini');
}

export function pspNandDir(enginesDir: string): string {
  return path.join(ppssppMemstick(enginesDir), 'PSP', 'NAND');
}

export function pspFlash0Dir(enginesDir: string): string {
  return path.join(pspNandDir(enginesDir), 'flash0');
}

/** Creates portable.txt + the memstick skeleton; safe to call on every launch. */
export function ensurePpssppPortable(enginesDir: string): void {
  const engineDir = ppssppEngineDir(enginesDir);
  if (!existsSync(engineDir)) return;
  const portable = path.join(engineDir, 'portable.txt');
  if (!existsSync(portable)) writeFileSync(portable, '');
  mkdirSync(path.join(ppssppMemstick(enginesDir), 'PSP', 'SYSTEM'), { recursive: true });
}

/** True when XMB has the firmware shell it needs. */
export function hasPspFirmware(enginesDir: string): boolean {
  const memstick = ppssppMemstick(enginesDir);
  return (
    existsSync(path.join(memstick, 'PSP', 'NAND', 'flash0', 'vsh', 'module', 'vshmain.prx')) ||
    existsSync(path.join(memstick, 'PSP', 'flash0', 'font'))
  );
}

function isFlash0Root(dir: string): boolean {
  return existsSync(path.join(dir, 'vsh', 'module', 'vshmain.prx'));
}

/** Accepts flash0 itself, or a parent such as NAND/ or memstick/PSP/. */
export function resolveFlash0Root(source: string): string | null {
  const candidates = [
    source,
    path.join(source, 'flash0'),
    path.join(source, 'NAND', 'flash0'),
    path.join(source, 'PSP', 'NAND', 'flash0'),
  ];
  for (const candidate of candidates) {
    if (isFlash0Root(candidate)) return candidate;
  }
  return null;
}

export type PspFlash0ImportResult =
  | { ok: true; path: string; previous?: string }
  | { ok: false; error: 'invalid-psp-flash0' | 'psp-flash0-io-error' };

/**
 * Imports a decrypted flash0 folder into the portable memstick. Uses a
 * directory junction when possible (no copy, instant) and falls back to a full
 * copy on filesystems that do not allow symlinks.
 */
export function importPspFlash0(enginesDir: string, source: string): PspFlash0ImportResult {
  const root = resolveFlash0Root(source);
  if (!root) return { ok: false, error: 'invalid-psp-flash0' };
  const target = pspFlash0Dir(enginesDir);
  mkdirSync(path.dirname(target), { recursive: true });

  let previous: string | undefined;
  if (existsSync(target)) {
    previous = `${target}.before-import-${Date.now()}`;
    try {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        rmSync(target, { force: true });
      } else {
        renameSync(target, previous);
      }
    } catch {
      return { ok: false, error: 'psp-flash0-io-error' };
    }
  }

  try {
    symlinkSync(root, target, 'junction');
    return { ok: true, path: target, previous };
  } catch {
    try {
      cpSync(root, target, { recursive: true });
      return { ok: true, path: target, previous };
    } catch {
      return { ok: false, error: 'psp-flash0-io-error' };
    }
  }
}
