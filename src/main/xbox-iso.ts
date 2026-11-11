/**
 * Xbox disc packaging + launch-path helpers.
 *
 * Two xemu quirks decide the design here:
 *  - it only boots disc images (`-dvd_path <iso>`), never an unpacked folder;
 *  - its QEMU argument builder re-splits the path on spaces, so a ROM path with
 *    a space silently becomes a broken `-drive` value.
 *
 * So Nest can pack a folder (one with `default.xbe`) into an XISO using the
 * bundled extract-xiso, and always hands xemu a hard link (same volume, no extra
 * disk) whose path contains no spaces.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function xboxIsoDir(userData: string): string {
  return path.join(userData, 'xbox-iso');
}

/** Hard links must live on the same volume; use TEMP when userData has spaces. */
export function xboxRomLinkDir(userData: string): string {
  return /\s/.test(userData)
    ? path.join(os.tmpdir(), 'nest-xbox-roms')
    : path.join(userData, 'xbox-roms');
}

export function isXboxFolder(target: string): boolean {
  try {
    return statSync(target).isDirectory() && existsSync(path.join(target, 'default.xbe'));
  } catch {
    return false;
  }
}

export function isXboxIso(target: string): boolean {
  return /\.(iso|xiso)$/i.test(target);
}

export interface PackResult {
  ok: boolean;
  iso?: string;
  error?: 'missing-tool' | 'pack-failed' | 'timeout' | 'bad-folder';
  log?: string;
}

function extractXisoPath(toolsDir: string): string {
  return path.join(toolsDir, 'extract-xiso.exe');
}

/** Runs extract-xiso -c <folder> <out.iso>. The output path must be space-free. */
export function packXboxFolder(
  toolsDir: string,
  folder: string,
  outIso: string,
  timeoutMs = 15 * 60 * 1000,
): Promise<PackResult> {
  const tool = extractXisoPath(toolsDir);
  if (!existsSync(tool)) return Promise.resolve({ ok: false, error: 'missing-tool' });
  if (!isXboxFolder(folder)) return Promise.resolve({ ok: false, error: 'bad-folder' });
  mkdirSync(path.dirname(outIso), { recursive: true });
  rmSync(outIso, { force: true });

  return new Promise((resolve) => {
    let output = '';
    const child = spawn(tool, ['-c', folder, outIso], { windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: 'timeout', log: output.slice(-2000) });
    }, timeoutMs);
    const collect = (chunk: Buffer) => {
      output += chunk.toString('latin1');
      if (output.length > 20000) output = output.slice(-20000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, error: 'pack-failed', log: output.slice(-2000) });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && existsSync(outIso) && statSync(outIso).size > 0) {
        resolve({ ok: true, iso: outIso, log: output.slice(-2000) });
      } else {
        resolve({ ok: false, error: 'pack-failed', log: output.slice(-2000) });
      }
    });
  });
}

export interface PreparedRom {
  ok: boolean;
  rom?: string;
  /** True when this call packed the folder into a new ISO. */
  packed?: boolean;
  error?: string;
}

/**
 * Returns a space-free path xemu can boot. Folder games are packed first when
 * `allowPack` is set; otherwise the caller gets a clear error instead.
 */
export async function prepareXboxRom(
  userData: string,
  toolsDir: string,
  gameId: string,
  rom: string,
  allowPack = true,
): Promise<PreparedRom> {
  let iso: string | null = null;
  let packed = false;

  if (isXboxFolder(rom)) {
    iso = path.join(xboxIsoDir(userData), `${gameId}.iso`);
    if (!existsSync(iso) || statSync(iso).size === 0) {
      if (!allowPack) return { ok: false, error: 'xbox-needs-iso' };
      const result = await packXboxFolder(toolsDir, rom, iso);
      if (!result.ok) return { ok: false, error: result.error ?? 'pack-failed' };
      packed = true;
    }
  } else if (isXboxIso(rom)) {
    iso = rom;
  } else {
    return { ok: false, error: 'xbox-needs-iso' };
  }

  // Fast path: the ISO already has no spaces, xemu can read it directly.
  if (!/\s/.test(iso)) {
    return { ok: true, rom: iso, packed };
  }

  const linkDir = xboxRomLinkDir(userData);
  mkdirSync(linkDir, { recursive: true });
  const link = path.join(linkDir, `${gameId}.iso`);
  try {
    if (existsSync(link)) {
      if (statSync(link).size === statSync(iso).size) return { ok: true, rom: link, packed };
      rmSync(link, { force: true });
    }
    try {
      linkSync(iso, link);
    } catch {
      // Different volume: fall back to a copy so xemu still gets a clean path.
      copyFileSync(iso, link);
    }
    return { ok: true, rom: link, packed };
  } catch {
    return { ok: false, error: 'xbox-rom-link-failed' };
  }
}
