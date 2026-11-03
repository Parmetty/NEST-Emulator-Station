/**
 * PCSX2 integration helpers.
 *
 * PCSX2 is launched with `-datapath <base>`; it appends `PCSX2/` to that base
 * (verified with the v2.8.2 Qt build), so Nest's data lives in:
 *
 *   <userData>/playstation/PCSX2/{inis,bios,memcards,sstates,logs}
 *
 * A generated default `PCSX2.ini` is shipped under the engine's `seed/` folder.
 * PCSX2 refuses to start without a complete config (it resets to defaults and
 * runs the first-run wizard), so the seed file is copied once and the wizard
 * flag is cleared. BIOS images are user-supplied; `-bios` boots the PS2
 * browser/OSDSYS only when one is present.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function pcsx2DataPath(userData: string): string {
  return path.join(userData, 'playstation');
}

export function pcsx2ConfigDir(userData: string): string {
  return path.join(pcsx2DataPath(userData), 'PCSX2');
}

export function pcsx2BiosDir(userData: string): string {
  return path.join(pcsx2ConfigDir(userData), 'bios');
}

export function pcsx2IniPath(userData: string): string {
  return path.join(pcsx2ConfigDir(userData), 'inis', 'PCSX2.ini');
}

export interface Pcsx2Data {
  ok: boolean;
  configDir: string;
  ini: string;
  /** True when the ini was created from the seed this run. */
  seeded: boolean;
}

/** Creates the data skeleton and seeds PCSX2.ini on first launch. */
export function ensurePcsx2Data(userData: string, seedDir: string): Pcsx2Data {
  const configDir = pcsx2ConfigDir(userData);
  for (const sub of ['inis', 'bios', 'memcards', 'sstates', 'logs']) {
    mkdirSync(path.join(configDir, sub), { recursive: true });
  }
  const ini = pcsx2IniPath(userData);
  let seeded = false;
  if (!existsSync(ini)) {
    const seed = path.join(seedDir, 'PCSX2.ini');
    if (existsSync(seed)) {
      copyFileSync(seed, ini);
      seeded = true;
    }
  }
  return { ok: existsSync(ini), configDir, ini, seeded };
}

/** BIOS images are ~4 MB; return the usable ones so the caller can require one. */
export function pcsx2BiosFiles(userData: string): string[] {
  const dir = pcsx2BiosDir(userData);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => /\.bin$/i.test(name))
      .map((name) => path.join(dir, name))
      .filter((file) => {
        try {
          return statSync(file).size >= 1024 * 1024;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}
