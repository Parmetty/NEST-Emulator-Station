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
  /** Path → {size, sha1} of games already in the library, so rescans skip hashing. */
  known?: Map<string, KnownEntry>;
}

export interface KnownEntry {
  size: number;
  sha1: string;
}

/** Bigger files are fingerprinted from head + tail + size instead of fully read. */
const FULL_HASH_LIMIT = 64 * 1024 * 1024;
const SAMPLE_BYTES = 4 * 1024 * 1024;

export function normalizePathKey(file: string): string {
  return file.replace(/\\/g, '/').toLowerCase();
}

/** Stable identity of a ROM: full SHA-1 when small, cheap head/tail sample when huge. */
export async function fingerprintOf(file: string, size: number): Promise<string> {
  if (size <= FULL_HASH_LIMIT) return sha1Of(file);
  const hash = createHash('sha1');
  hash.update(`size:${size}`);
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(SAMPLE_BYTES);
    const headRead = await handle.read(head, 0, SAMPLE_BYTES, 0);
    hash.update(head.subarray(0, headRead.bytesRead));
    const tail = Buffer.alloc(SAMPLE_BYTES);
    const tailRead = await handle.read(tail, 0, SAMPLE_BYTES, Math.max(0, size - SAMPLE_BYTES));
    hash.update(tail.subarray(0, tailRead.bytesRead));
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

async function fileId(file: string, size: number, known?: Map<string, KnownEntry>): Promise<string> {
  const hit = known?.get(normalizePathKey(file));
  if (hit && hit.size === size) return hit.sha1;
  return fingerprintOf(file, size);
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
      // PSP UMD images are ISO9660 too, but many repacks have an empty volume
      // label; the game directory / UMD marker is the reliable signal.
      if (/PSP[ _]GAME|UMD_DATA\.BIN/.test(text)) return 'psp';
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
 * PSP games live in two folder shapes:
 *
 *   <title>/PSP_GAME/PARAM.SFO            <- extracted UMD dump (picked from PSP/GAME)
 *   <title>/EBOOT.PBP + PARAM.SFO         <- PSN / homebrew download
 *
 * PPSSPP boots an EBOOT.PBP directly, so the stored path is that file while the
 * display name comes from the folder.
 */
async function detectPspGame(
  dir: string,
): Promise<{ root: string; target: string; titleDir: string } | null> {
  const umdSfo = path.join(dir, 'PSP_GAME', 'PARAM.SFO');
  try {
    const sfo = await stat(umdSfo);
    if (sfo.isFile()) return { root: dir, target: dir, titleDir: dir };
  } catch {
    /* not an extracted UMD dump */
  }
  const eboot = path.join(dir, 'EBOOT.PBP');
  try {
    const file = await stat(eboot);
    if (file.isFile() && file.size > 0) return { root: dir, target: eboot, titleDir: dir };
  } catch {
    /* not a PSN/homebrew folder */
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
                sha1: await fileId(ps3.paramSfo, info.size, options.known),
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
                sha1: await fileId(xboxFolder.xbe, info.size, options.known),
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
        const psp = await detectPspGame(full);
        if (psp) {
          if (seen >= maxFiles) return;
          if (!options.systemId || options.systemId === 'psp') {
            seen += 1;
            try {
              // Hash the disc metadata (PARAM.SFO) for UMD dumps, the bootable
              // EBOOT.PBP for PSN/homebrew folders.
              const hashTarget =
                psp.target === psp.root ? path.join(psp.root, 'PSP_GAME', 'PARAM.SFO') : psp.target;
              const info = await stat(hashTarget);
              const meta = gameInfoFor(psp.root, 'psp');
              found.push({
                path: psp.target,
                fileName: path.basename(psp.titleDir),
                size: info.size,
                sha1: await fileId(hashTarget, info.size, options.known),
                systemId: 'psp',
                title: meta.title ?? titleFrom(path.basename(psp.titleDir)),
                region: meta.region,
              });
            } catch {
              /* unreadable PSP folder: skip */
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
                sha1: await fileId(god.header, info.size, options.known),
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
        // A folder game that was packed into a sibling ISO stays one library
        // entry: keep the folder (stable default.xbe hash), skip the image.
        if (systemId === 'xbox' && full.toLowerCase().endsWith('.iso')) {
          const folder = full.slice(0, -4);
          try {
            const statFolder = await stat(folder);
            if (statFolder.isDirectory()) {
              try {
                const xbe = await stat(path.join(folder, 'default.xbe'));
                if (xbe.isFile()) continue;
              } catch {
                /* sibling has no default.xbe: keep the ISO */
              }
            }
          } catch {
            /* no sibling folder */
          }
        }
        const info = await stat(full);
        const sha1 = await fileId(full, info.size, options.known);
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
