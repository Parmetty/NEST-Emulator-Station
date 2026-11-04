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
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
