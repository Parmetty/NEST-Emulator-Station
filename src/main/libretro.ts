/**
 * libretro host helpers (no Electron imports, so they are unit-testable).
 *
 * Nest ships its own tiny libretro frontend (`resources/tools/nest-libretro.exe`)
 * plus the Dolphin libretro core. That replaces driving the Dolphin GUI through
 * UI Automation for the GC / Wii system menus. This module owns everything
 * filesystem-shaped: where the host/core live, which runtime folders the core
 * expects, staging Dolphin's `Sys` data + the user's firmware dumps into them,
 * and where the host drops the screenshots it uses for covers.
 *
 * Layout the Dolphin libretro core expects (confirmed from its own boot log):
 *   <sys dir>/dolphin-emu/Sys          <- copied from resources/engines/dolphin/Sys
 *   <save dir>/User/...                <- NAND, config, and IPL.bin for the GC menu
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../shared/contract';

export interface LibretroPaths {
  /** `<app>/resources/tools` (or `process.resourcesPath/tools` when packaged). */
  toolsDir: string;
  /** `<app>/resources/engines` (or `process.resourcesPath/engines`). */
  enginesDir: string;
  /** Electron `app.getPath('userData')`. */
  userData: string;
}

export interface LibretroAvailability {
  host: string;
  core: string;
  available: boolean;
}

export function libretroHostPath(toolsDir: string): string {
  return path.join(toolsDir, 'nest-libretro.exe');
}

export function libretroCorePath(enginesDir: string): string {
  return path.join(enginesDir, 'dolphin', 'dolphin_libretro.dll');
}

export function libretroAvailability(paths: LibretroPaths): LibretroAvailability {
  const host = libretroHostPath(paths.toolsDir);
  const core = libretroCorePath(paths.enginesDir);
  return { host, core, available: existsSync(host) && existsSync(core) };
}

/** `<userData>/libretro/sys` — passed to the host as `--system-dir`. */
export function libretroSysDir(userData: string): string {
  return path.join(userData, 'libretro', 'sys');
}

/** `<userData>/libretro/save` — passed to the host as `--save-dir`. */
export function libretroSaveDir(userData: string): string {
  return path.join(userData, 'libretro', 'save');
}

/** Frames the host dumps while playing; promoted to a cover when the session ends. */
export function libretroShotDir(userData: string): string {
  return path.join(userData, 'covers-pending');
}

/** New preferred place for the user's Wii Menu WAD (the host boots it via --rom). */
export function hostWiiMenuWad(userData: string): string {
  return path.join(userData, 'firmware', 'wii', 'wii-menu.wad');
}

/** Where the older Dolphin-Qt system-mode path (and the existing importer) puts it. */
export function legacyWiiMenuWad(userData: string): string {
  return path.join(userData, 'dolphin', 'wii-menu.wad');
}

/** The WAD actually available right now: new location first, then the legacy one. */
export function findWiiMenuWad(userData: string): string | null {
  const candidates = [hostWiiMenuWad(userData), legacyWiiMenuWad(userData)];
  return candidates.find((file) => existsSync(file)) ?? null;
}

/* ------------------------------------------------------------- host keys */
/**
 * `KeyboardEvent.code` → the key token the libretro host accepts in `--keys`.
 * The host understands letters/digits/F-keys plus a small named set (see
 * tools/libretro/HostInput.cs `TryParseKey`); anything else is dropped.
 */
export function hostKeyToken(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  const named: Record<string, string> = {
    Space: 'SPACE',
    Enter: 'ENTER',
    Escape: 'ESC',
    Tab: 'TAB',
    Backspace: 'BACKSPACE',
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    ShiftLeft: 'LSHIFT',
    ShiftRight: 'RSHIFT',
  };
  return named[code] ?? null;
}

/**
 * PadAction → host action name. The host's joypad ids come from the core's
 * input descriptors (see HostInput.ApplyDescriptors):
 *   GC: A/B/X/Y/L/R/Z/Start/Select + left stick as LU/LD/LL/LR (LX/LY aliases)
 *   Wii: A/B/1/2/+/-/Home/Shake + d-pad
 */
const GAMECUBE_HOST_ACTIONS: Partial<Record<PadAction, string>> = {
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  l: 'L',
  r: 'R',
  start: 'START',
  select: 'SELECT',
  // Nest's model puts the d-pad axes on the GameCube main stick (see KEYMAP):
  // the host's LX/LY are aliases for the negative stick directions.
  up: 'LY',
  down: 'LD',
  left: 'LX',
  right: 'LR',
};

const WII_HOST_ACTIONS: Partial<Record<PadAction, string>> = {
  a: 'A',
  b: 'B',
  x: 'X', // Wii remote "1"
  y: 'Y', // Wii remote "2"
  start: 'PLUS',
  select: 'MINUS',
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
};

/**
 * Build the `--keys "A=J,START=ENTER,…"` argument for a system from the user's
 * key overrides. Returns null when nothing customised — the host's built-in
 * default table is used then, so an unchanged install emits no argument at all.
 */
export function hostKeysSpec(systemId: string, bindings: KeyboardBindings | undefined): string | null {
  if (!bindings) return null;
  const actions = systemId === 'wii' ? WII_HOST_ACTIONS : GAMECUBE_HOST_ACTIONS;
  const parts: string[] = [];
  for (const [action, hostAction] of Object.entries(actions) as Array<[PadAction, string]>) {
    const code = bindings[action];
    if (!code) continue;
    const token = hostKeyToken(code);
    if (!token) continue;
    parts.push(`${hostAction}=${token}`);
  }
  return parts.length > 0 ? parts.join(',') : null;
}

const GC_REGIONS = ['USA', 'JAP', 'EUR'] as const;

export interface StageResult {
  ok: boolean;
  /** True when `<sys>/dolphin-emu/Sys` is usable after staging. */
  sysReady: boolean;
  /** Files/directories that were copied this run (empty when already staged). */
  staged: string[];
  errors: string[];
}

/**
 * First-launch preparation. Idempotent: a marker file keeps the (large) Dolphin
 * `Sys` tree from being copied on every launch, while firmware dumps are
 * refreshed only when the source is newer.
 */
export function stageLibretroRuntime(paths: LibretroPaths): StageResult {
  const staged: string[] = [];
  const errors: string[] = [];
  const sysDir = libretroSysDir(paths.userData);
  const saveDir = libretroSaveDir(paths.userData);
  const shotDir = libretroShotDir(paths.userData);

  try {
    for (const dir of [sysDir, saveDir, shotDir, path.join(paths.userData, 'libretro')]) {
      mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    return { ok: false, sysReady: false, staged, errors: [(err as Error).message] };
  }

  // 1. Dolphin's Sys resources -> <sys>/dolphin-emu/Sys
  const srcSys = path.join(paths.enginesDir, 'dolphin', 'Sys');
  const dstSys = path.join(sysDir, 'dolphin-emu', 'Sys');
  const marker = path.join(sysDir, '.nest-sys-v1');
  let sysReady = existsSync(dstSys);
  if (existsSync(srcSys)) {
    if (!sysReady || !existsSync(marker)) {
      try {
        cpSync(srcSys, dstSys, { recursive: true, force: true });
        const licenses = path.join(paths.enginesDir, 'dolphin', 'Licenses');
        if (existsSync(licenses)) {
          cpSync(licenses, path.join(sysDir, 'dolphin-emu', 'Licenses'), { recursive: true, force: true });
        }
        staged.push(dstSys);
        sysReady = true;
        writeFileSync(marker, 'applied-v1\n', 'utf8');
      } catch (err) {
        errors.push(`sys: ${(err as Error).message}`);
      }
    }
  } else {
    // Without Sys the core cannot boot anything; a partial copy would be worse
    // than falling back to the Dolphin-Qt path.
    errors.push('missing-dolphin-sys');
    sysReady = false;
  }

  // 2. Wii Menu WAD: the existing importer writes the legacy Dolphin path;
  //    mirror it into the host location so the manifest can hard-code one path.
  const legacyWad = legacyWiiMenuWad(paths.userData);
  const hostWad = hostWiiMenuWad(paths.userData);
  if (existsSync(legacyWad) && copyIfNewer(legacyWad, hostWad)) staged.push(hostWad);

  // 3. GameCube IPL: the Qt path keeps them in <userData>/dolphin/GC/<region>/IPL.bin;
  //    the libretro core reads them from its own user dir (<save>/User/GC/<region>).
  for (const region of GC_REGIONS) {
    const source = path.join(paths.userData, 'dolphin', 'GC', region, 'IPL.bin');
    const target = path.join(saveDir, 'User', 'GC', region, 'IPL.bin');
    if (existsSync(source) && copyIfNewer(source, target)) staged.push(target);
  }

  return { ok: sysReady, sysReady, staged, errors };
}

/** Copy `source` over `target` when missing or older. Returns true when copied. */
function copyIfNewer(source: string, target: string): boolean {
  try {
    if (existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs) return false;
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { force: true });
    return true;
  } catch {
    return false;
  }
}

export interface ShotCandidate {
  path: string;
  mtimeMs: number;
}

/** PNG frames from the host, newest first (used to pick a non-black cover). */
export function listShotCandidates(dir: string): ShotCandidate[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.png'))
      .map((name) => {
        const full = path.join(dir, name);
        try {
          return { path: full, mtimeMs: statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((item): item is ShotCandidate => item !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}
