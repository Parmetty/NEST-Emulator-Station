import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** Extension → system. .iso is ambiguous (GC/PS2/…); PS platforms are locked, so it maps to NGC. */
export const EXT_TO_SYSTEM: Record<string, string> = {
  gba: 'gba',
  agb: 'gba',
  nes: 'fc',
  fds: 'fc',
  unf: 'fc',
  sfc: 'sfc',
  smc: 'sfc',
  swc: 'sfc',
  fig: 'sfc',
  n64: 'n64',
  z64: 'n64',
  v64: 'n64',
  gcm: 'ngc',
  iso: 'ngc',
  rvz: 'ngc',
  wbfs: 'wii',
  nds: 'nds',
  '3ds': '3ds',
  cci: '3ds',
  cxi: '3ds',
  app: '3ds',
};

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

const DEFAULT_DEPTH = 6;
const DEFAULT_FILES = 20_000;

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

/** Recursively collects ROMs under `root`. Unreadable files are skipped, not fatal. */
export async function scanFolder(root: string, options: ScanOptions = {}): Promise<ScannedFile[]> {
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
      const systemId = EXT_TO_SYSTEM[path.extname(entry.name).slice(1).toLowerCase()];
      if (!systemId) continue;
      if (options.systemId && systemId !== options.systemId) continue;
      seen += 1;
      try {
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
