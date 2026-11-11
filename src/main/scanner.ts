import { createHash } from 'node:crypto';
import { gameInfoFor } from './game-info';
import { createReadStream } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
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
  wua: 'wiiu',
  wud: 'wiiu',
  wux: 'wiiu',
  cso: 'psp',
  elf: 'psp',
  cue: 'ps1',
  chd: 'ps1',
  pbp: 'ps1',
  mds: 'ps1',
  ccd: 'ps1',
  nds: 'nds',
  dsi: 'nds',
  ids: 'nds',
  srl: 'nds',
  '3ds': '3ds',
  cci: '3ds',
  cxi: '3ds',
  '3dsx': '3ds',
  cia: '3ds',
  xex: 'xbox360',
  xbe: 'xbox',
};

/** Disc images whose system must be decided by the header, not the extension. */
const AMBIGUOUS_DISC_EXT = new Set(['iso', 'rvz', 'gcz', 'ciso']);

/** Xbox XDVDFS volume descriptor, seen at 0 or 0x10000 in XISO images. */
const XDVDFS_MAGIC = 'MICROSOFT*XBOX*MEDIA';

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
  /** Region label parsed from the container, when known. */
  region?: string;
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

    // PS2 ISO: the ISO9660 system area carries "PLAYSTATION" in SYSTEM.CNF /
    // the volume descriptor. Scan the first 1 MB for the ASCII marker.
    const probe = Buffer.alloc(1024 * 1024);
    const probeRead = await handle.read(probe, 0, probe.length, 0);
    if (probeRead.bytesRead > 0) {
      const text = probe.subarray(0, probeRead.bytesRead).toString('latin1');
      if (text.includes(XDVDFS_MAGIC)) return 'xbox';
      if (text.includes('PLAYSTATION')) return 'ps2';
      if (text.includes('PSP GAME')) return 'psp';
    }
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


/** A PS3 game is a folder with PARAM.SFO + USRDIR (or a PS3_GAME folder). */
async function detectPs3Game(
  dir: string,
): Promise<{ root: string; paramSfo: string; titleDir: string } | null> {
  const candidates = [
    { root: dir, sfo: path.join(dir, 'PARAM.SFO'), usr: path.join(dir, 'USRDIR') },
    {
      root: dir,
      sfo: path.join(dir, 'PS3_GAME', 'PARAM.SFO'),
      usr: path.join(dir, 'PS3_GAME', 'USRDIR'),
    },
  ];
  for (const candidate of candidates) {
    try {
      const sfo = await stat(candidate.sfo);
      const usr = await stat(candidate.usr);
      if (!sfo.isFile() || !usr.isDirectory()) continue;
      return {
        root: candidate.root,
        paramSfo: candidate.sfo,
        titleDir: path.basename(dir) === 'PS3_GAME' ? path.dirname(dir) : dir,
      };
    } catch {
      /* not a PS3 game folder */
    }
  }
  return null;
}

/**
 * Xbox 360 GOD / STFS installs are directories, not single files:
 *
 *   4D530AA4/00007000/<package-hash>        <- 45 KB STFS header, magic "LIVE"
 *   .../<package-hash>.data/Data0000...     <- split payload
 *
 * The header file is a valid launch target for Xenia and gives us a stable path.
 */
async function godTitle(header: string): Promise<string | null> {
  try {
    const text = (await readFile(header)).toString('utf16le');
    for (const match of text.matchAll(/[ -~]{4,}/g)) {
      const value = match[0].trim();
      if (!value) continue;
      if (/installed game|original game disc|microsoft|xbox|http/i.test(value)) continue;
      return titleFrom(value);
    }
  } catch {
    /* fall through to the folder name */
  }
  return null;
}

async function detectXbox360God(
  dir: string,
): Promise<{ header: string; titleDir: string; title: string | null } | null> {
  const base = path.basename(dir);
  const godDir = base === '00007000' ? dir : path.join(dir, '00007000');
  const titleDir = base === '00007000' ? path.dirname(dir) : dir;
  let entries;
  try {
    entries = await readdir(godDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const header = path.join(godDir, entry.name);
    const dataDir = `${header}.data`;
    try {
      const dataStat = await stat(dataDir);
      if (!dataStat.isDirectory()) continue;
      const handle = await open(header, 'r');
      try {
        const magic = Buffer.alloc(4);
        const { bytesRead } = await handle.read(magic, 0, 4, 0);
        if (bytesRead === 4 && magic.toString('latin1') === 'LIVE') {
          return { header, titleDir, title: await godTitle(header) };
        }
      } finally {
        await handle.close();
      }
    } catch {
      /* not a GOD package */
    }
  }
  return null;
}

/**
 * An unpacked Xbox game is a folder with `default.xbe`; xemu can boot that
 * folder directly, so Nest stores the directory itself as the launch target.
 */
async function detectXboxFolder(dir: string): Promise<{ root: string; xbe: string } | null> {
  const xbe = path.join(dir, 'default.xbe');
  try {
    const entry = await stat(xbe);
    if (!entry.isFile() || entry.size === 0) return null;
    return { root: dir, xbe };
  } catch {
    return null;
  }
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
        const ps3 = await detectPs3Game(full);
        if (ps3) {
          if (seen >= maxFiles) return;
          if (!options.systemId || options.systemId === 'ps3') {
            seen += 1;
            try {
              const info = await stat(ps3.paramSfo);
              const meta = gameInfoFor(ps3.root, 'ps3');
              found.push({
                path: ps3.root,
                fileName: path.basename(ps3.titleDir),
                size: info.size,
                sha1: await sha1Of(ps3.paramSfo),
                systemId: 'ps3',
                title: meta.title ?? titleFrom(path.basename(ps3.titleDir)),
                region: meta.region,
              });
            } catch {
              /* unreadable PS3 folder: skip */
            }
          }
          continue;
        }
        const xboxFolder = await detectXboxFolder(full);
        if (xboxFolder) {
          if (seen >= maxFiles) return;
          if (!options.systemId || options.systemId === 'xbox') {
            seen += 1;
            try {
              const info = await stat(xboxFolder.xbe);
              const meta = gameInfoFor(xboxFolder.root, 'xbox');
              found.push({
                path: xboxFolder.root,
                fileName: path.basename(full),
                size: info.size,
                sha1: await sha1Of(xboxFolder.xbe),
                systemId: 'xbox',
                title: meta.title ?? titleFrom(path.basename(full)),
                region: meta.region,
              });
            } catch {
              /* unreadable Xbox folder: skip */
            }
          }
          continue;
        }
        const god = await detectXbox360God(full);
        if (god) {
          if (seen >= maxFiles) return;
          if (!options.systemId || options.systemId === 'xbox360') {
            seen += 1;
            try {
              const info = await stat(god.header);
              const meta = gameInfoFor(god.header, 'xbox360');
              found.push({
                path: god.header,
                fileName: path.basename(god.titleDir),
                size: info.size,
                sha1: await sha1Of(god.header),
                systemId: 'xbox360',
                title: meta.title ?? god.title ?? titleFrom(path.basename(god.titleDir)),
                region: meta.region,
              });
            } catch {
              /* unreadable GOD package: skip */
            }
          }
          continue;
        }
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
        const meta = gameInfoFor(full, systemId);
        found.push({
          path: full,
          fileName: entry.name,
          size: info.size,
          sha1,
          systemId,
          title: meta.title ?? titleFrom(entry.name),
          region: meta.region,
        });
      } catch {
        /* unreadable file: skip */
      }
    }
  }

  await walk(root, 0);
  return found;
}
