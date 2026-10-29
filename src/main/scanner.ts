import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Extension → system. `.iso` / `.rvz` cover both GameCube and Wii discs, so the
 * extension alone is not enough: those go through {@link sniffSystem} which
 * reads the disc header. `.wbfs` is always Wii.
 */
export const EXT_TO_SYSTEM: Record<string, string> = {
  gba: 'gba',
  agb: 'gba',
  nes: 'fc',
  fds: 'fc',
  unf: 'fc',
  unif: 'fc',
  sfc: 'sfc',
  smc: 'sfc',
  swc: 'sfc',
  fig: 'sfc',
  bs: 'sfc',
  n64: 'n64',
  z64: 'n64',
  v64: 'n64',
  gcm: 'ngc',
  iso: 'ngc',
  rvz: 'ngc',
  gcz: 'ngc',
  ciso: 'ngc',
  dol: 'ngc',
  wbfs: 'wii',
  wia: 'wii',
  nds: 'nds',
  dsi: 'nds',
  ids: 'nds',
  srl: 'nds',
  '3ds': '3ds',
  cci: '3ds',
  cxi: '3ds',
  '3dsx': '3ds',
  cia: '3ds',
};

/** Disc images whose system must be decided by the header, not the extension. */
const AMBIGUOUS_DISC_EXT = new Set(['iso', 'rvz', 'gcz', 'ciso']);

/** GameCube disc magic at 0x18 (big endian). */
const GC_MAGIC = 0xc2339f3f;
/** Wii disc magic at 0x18 (big endian). */
const WII_MAGIC = 0x5d1c9ea3;

export interface ScannedFile {
  path: string;
  fileName: string;
  size: number;
  sha1: string;
  systemId: string;
  title: string;
}

export interface ScanOptions {
  /** Only keep files that belong to this system. */
  systemId?: string;
  maxDepth?: number;
  maxFiles?: number;
}

const DEFAULT_DEPTH = 8;
const DEFAULT_FILES = 50_000;

export function titleFrom(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  return (
    base
      .replace(/\[[^\]]*]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || base
  );
}

function sha1Of(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Reads the 4-byte disc magic at 0x18 to tell a GameCube image from a Wii one.
 * A `.wbfs` file keeps the ISO header after its 0x200-byte wrapper.
 */
async function sniffDiscSystem(file: string, ext: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(file, 'r');
    const offset = ext === 'wbfs' ? 0x200 + 0x18 : 0x18;
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, 4, offset);
    if (bytesRead < 4) return null;
    const magic = buffer.readUInt32BE(0);
    if (magic === GC_MAGIC) return 'ngc';
    if (magic === WII_MAGIC) return 'wii';
    return null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

/** Resolves the system for one file, falling back to the extension table. */
export async function systemForFile(file: string): Promise<string | null> {
  const ext = path.extname(file).slice(1).toLowerCase();
  const byExtension = EXT_TO_SYSTEM[ext];
  if (!byExtension) return null;
  if (ext === 'wbfs' || AMBIGUOUS_DISC_EXT.has(ext)) {
    const sniffed = await sniffDiscSystem(file, ext);
    if (sniffed) return sniffed;
  }
  return byExtension;
}

/** Recursively collects ROMs under `root`. Unreadable files are skipped, not fatal. */
export async function scanFolder(root: string, options: ScanOptions = {}): Promise<ScannedFile[]> {
  // Engines are spawned with `cwd` set to the engine folder, so every stored
  // path must be absolute — a relative `--scan=` root used to produce library
  // entries the emulator could never find.
  root = path.resolve(root);
  const maxDepth = options.maxDepth ?? DEFAULT_DEPTH;
  const maxFiles = options.maxFiles ?? DEFAULT_FILES;
  const found: ScannedFile[] = [];
  let seen = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || seen >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen >= maxFiles) return;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!EXT_TO_SYSTEM[path.extname(entry.name).slice(1).toLowerCase()]) continue;
      seen += 1;
      try {
        const systemId = await systemForFile(full);
        if (!systemId) continue;
        if (options.systemId && systemId !== options.systemId) continue;
        const info = await stat(full);
        const sha1 = await sha1Of(full);
        found.push({
          path: full,
          fileName: entry.name,
          size: info.size,
          sha1,
          systemId,
          title: titleFrom(entry.name),
        });
      } catch {
        /* unreadable file: skip */
      }
    }
  }

  await walk(root, 0);
  return found;
}
