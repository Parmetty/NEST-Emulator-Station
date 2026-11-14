/**
 * Game metadata sniffing: official title + region, straight from the file
 * headers. Pure Node, no emulator or network involved.
 *
 * Only the cheap, high-value formats are covered. Everything else keeps the
 * file-name title, and the user's manual rename always wins.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import path from 'node:path';

export interface GameInfo {
  /** Official title from the container header, when one exists. */
  title?: string;
  /** Human label such as "NTSC-U" / "NTSC-J" / "PAL" / "Region-Free". */
  region?: string;
}

const NDS_REGION: Record<string, string> = {
  J: 'NTSC-J', E: 'NTSC-U', P: 'PAL', D: 'PAL', F: 'PAL', I: 'PAL', S: 'PAL', H: 'PAL',
  K: 'NTSC-K', C: 'NTSC-C', O: 'PAL', X: 'PAL', Y: 'PAL', Z: 'PAL',
};

const GC_REGION: Record<string, string> = {
  E: 'NTSC-U', J: 'NTSC-J', P: 'PAL', U: 'NTSC-U', K: 'NTSC-K', W: 'NTSC-TW', C: 'NTSC-C',
  D: 'PAL', F: 'PAL', I: 'PAL', S: 'PAL', H: 'PAL', R: 'PAL', A: 'PAL', B: 'PAL', Y: 'PAL',
};

const N64_REGION: Record<number, string> = {
  0: 'NTSC-J', 1: 'NTSC-U', 2: 'PAL', 3: 'PAL', 4: 'PAL', 5: 'PAL', 6: 'PAL', 7: 'PAL',
  0x41: 'PAL', 0x42: 'PAL', 0x43: 'PAL', 0x44: 'PAL', 0x45: 'NTSC-U', 0x46: 'PAL', 0x47: 'PAL',
  0x48: 'PAL', 0x49: 'PAL', 0x4a: 'NTSC-J', 0x4b: 'NTSC-K', 0x4c: 'PAL', 0x4d: 'PAL', 0x50: 'PAL',
  0x53: 'PAL', 0x55: 'NTSC-U', 0x58: 'PAL', 0x59: 'PAL', 0x5a: 'PAL',
};

function readAt(file: string, offset: number, length: number): Buffer | null {
  let fd: number | null = null;
  try {
    fd = openSync(file, 'r');
    const buffer = Buffer.alloc(length);
    const got = readSync(fd, buffer, 0, length, offset);
    return got > 0 ? buffer.subarray(0, got) : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function ascii(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return (end >= 0 ? slice.subarray(0, end) : slice).toString('latin1').trim();
}

function utf16(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length);
  let end = slice.length;
  for (let i = 0; i + 1 < slice.length; i += 2) {
    if (slice[i] === 0 && slice[i + 1] === 0) { end = i; break; }
  }
  const text = slice.subarray(0, end).toString('utf16le');
  return text.replace(/[\u0000-\u001f]/g, '').trim();
}

function cleanTitle(raw: string): string | undefined {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (!value || value.length < 2) return undefined;
  if (/^[0-9A-F]{8}$/i.test(value)) return undefined; // Title IDs are not titles.
  return value;
}

/* ------------------------------------------------------------------ NDS / GBA */

function ndsInfo(file: string): GameInfo {
  const head = readAt(file, 0, 0x200);
  if (!head || head.length < 0x20) return {};
  const title = cleanTitle(ascii(head, 0, 12));
  const code = ascii(head, 0x0c, 4);
  const region = code.length === 4 ? NDS_REGION[code[3].toUpperCase()] : undefined;
  return { title, region };
}

function gbaInfo(file: string): GameInfo {
  const head = readAt(file, 0xa0, 0x20);
  if (!head || head.length < 0x10) return {};
  const title = cleanTitle(ascii(head, 0x00, 12));
  const code = ascii(head, 0x0c, 4);
  const region = code.length === 4 ? NDS_REGION[code[3].toUpperCase()] : undefined;
  return { title, region };
}

/* --------------------------------------------------------------------- N64 */

function n64Info(file: string): GameInfo {
  const head = readAt(file, 0, 0x40);
  if (!head || head.length < 0x40) return {};
  const magic = head.readUInt32BE(0);
  let country: number;
  if (magic === 0x80371240) country = head[0x3e];
  else if (magic === 0x40123780) country = head[0x3f];
  else if (magic === 0x37804012) country = head[0x3d];
  else country = head[0x3e];
  return { region: N64_REGION[country] };
}

/* -------------------------------------------------------------- GameCube/Wii */

function discInfo(file: string): GameInfo {
  const head = readAt(file, 0, 0x20);
  if (!head || head.length < 8) return {};
  const letter = String.fromCharCode(head[3]).toUpperCase();
  return { region: GC_REGION[letter] };
}

/* ------------------------------------------------------------------ PS3 SFO */

function sfoBufferInfo(raw: Buffer): GameInfo {
  if (raw.length < 0x14 || raw.toString('latin1', 0, 4) !== '\0PSF') return {};
  const keyTable = raw.readUInt32LE(0x08);
  const dataTable = raw.readUInt32LE(0x0c);
  const count = raw.readUInt32LE(0x10);
  const values = new Map<string, string>();
  for (let i = 0; i < Math.min(count, 64); i += 1) {
    const entry = 0x14 + i * 16;
    if (entry + 16 > raw.length) break;
    const keyOffset = raw.readUInt16LE(entry);
    const format = raw.readUInt16LE(entry + 2);
    const length = raw.readUInt32LE(entry + 4);
    const dataOffset = raw.readUInt32LE(entry + 12);
    const keyStart = keyTable + keyOffset;
    const keyEnd = raw.indexOf(0, keyStart);
    const key = raw.toString('latin1', keyStart, keyEnd >= 0 ? keyEnd : raw.length);
    const dataStart = dataTable + dataOffset;
    const slice = raw.subarray(dataStart, Math.min(raw.length, dataStart + Math.max(1, length)));
    if (format === 0x0204 || format === 0x0004) {
      values.set(key, slice.toString('utf8').replace(/\0+$/, ''));
    }
  }
  const title = cleanTitle(values.get('TITLE') ?? '');
  // PS3 discs use TITLE_ID, PSP discs use DISC_ID (ULUS-10563, ULES-01513...).
  const titleId = (values.get('TITLE_ID') ?? values.get('DISC_ID') ?? '').toUpperCase();
  const region = discRegion(titleId);
  return { title, region };
}

function sfoInfo(file: string): GameInfo {
  let raw: Buffer;
  try {
    raw = readFileSync(file);
  } catch {
    return {};
  }
  return sfoBufferInfo(raw);
}

/** PSP PSN / homebrew titles: EBOOT.PBP embeds PARAM.SFO right after the 0x28 header. */
function pbpInfo(file: string): GameInfo {
  let raw: Buffer;
  try {
    raw = readFileSync(file);
  } catch {
    return {};
  }
  if (raw.length < 0x28 || raw.toString('latin1', 0, 4) !== '\0PBP') return {};
  const sfoStart = raw.readUInt32LE(0x08);
  if (sfoStart <= 0 || sfoStart >= raw.length) return {};
  return sfoBufferInfo(raw.subarray(sfoStart));
}

/**
 * Disc title IDs carry the region:
 *   PS3: BLUS/SLUS/NPUB, BLES/SLES/NPEB, BLJM/SLPS/NPJB, BLAS/SLAS/NPKH
 *   PSP: ULUS/NPUH, ULES/NPEH, ULJM/ULJS/NPJH, ULAS/ULKS/NPKH
 */
function discRegion(titleId: string): string | undefined {
  if (!titleId) return undefined;
  if (/^(BLUS|SLUS|SCUS|NPUB|ULUS|NPUH)/.test(titleId)) return 'NTSC-U';
  if (/^(BLES|SLES|SCES|NPEB|NPEH|ULES)/.test(titleId)) return 'PAL';
  if (/^(BLJM|BLJS|BLPS|SLPS|SLPM|SCPS|NPJB|NPJH|ULJM|ULJS)/.test(titleId)) return 'NTSC-J';
  if (/^(BLAS|SLAS|BLKS|SLKA|NPKH|NPKA|ULAS|ULKS)/.test(titleId)) return 'NTSC-Asia';
  if (titleId.startsWith('NP')) return 'PSN';
  return undefined;
}

/* -------------------------------------------------------------------- Xbox */

function xbeInfoFromBuffer(buffer: Buffer, baseOffset: number): GameInfo {
  if (buffer.length < 0x120 || buffer.toString('latin1', 0, 4) !== 'XBEH') return {};
  const base = buffer.readUInt32LE(0x104);
  const certVa = buffer.readUInt32LE(0x118);
  if (!base || !certVa) return {};
  const certOffset = certVa - base;
  const cert = buffer.subarray(certOffset, certOffset + 0x200);
  if (cert.length < 0x100) return {};
  const title = cleanTitle(utf16(cert, 0x0c, 0x50));
  const flags = cert.readUInt32LE(0xa0);
  const labels: string[] = [];
  if (flags & 0x00000001) labels.push('NTSC-U');
  if (flags & 0x00000002) labels.push('NTSC-J');
  if (flags & 0x00000004) labels.push('PAL');
  const region = labels.length === 0 || flags === 0xffffffff || Boolean(flags & 0x80000000)
    ? 'Region-Free'
    : labels.join(' / ');
  void baseOffset;
  return { title, region };
}

function xbeFileInfo(file: string): GameInfo {
  const head = readAt(file, 0, 0x10000);
  if (!head) return {};
  return xbeInfoFromBuffer(head, 0);
}

/** Walks the XDVDFS directory table to find default.xbe inside an XISO. */
function xisoDefaultXbe(file: string): { offset: number; size: number } | null {
  const probe = readAt(file, 0, 1024 * 1024);
  if (!probe) return null;
  const magic = Buffer.from('MICROSOFT*XBOX*MEDIA', 'latin1');
  const descriptor = probe.indexOf(magic);
  if (descriptor < 0) return null;
  const descriptorHead = readAt(file, descriptor, 0x20);
  if (!descriptorHead || descriptorHead.length < 0x1c) return null;
  const rootSector = descriptorHead.readUInt32LE(0x14);
  const rootSize = descriptorHead.readUInt32LE(0x18);
  if (!rootSector || !rootSize || rootSize > 4 * 1024 * 1024) return null;
  const table = readAt(file, rootSector * 2048, rootSize);
  if (!table) return null;
  const seen = new Set<number>();
  const walk = (entry: number, depth: number): { offset: number; size: number } | null => {
    if (depth > 64) return null;
    const start = entry * 4;
    if (start < 0 || start + 14 > table.length) return null;
    if (seen.has(start)) return null;
    seen.add(start);
    const left = table.readUInt16LE(start);
    const right = table.readUInt16LE(start + 2);
    const sector = table.readUInt32LE(start + 4);
    const size = table.readUInt32LE(start + 8);
    const nameLength = table[start + 13];
    const name = table.toString('latin1', start + 14, start + 14 + nameLength);
    if (name.toLowerCase() === 'default.xbe') return { offset: sector * 2048, size };
    const child = left || right;
    // Siblings are stored as either byte offsets or 4-byte units depending on
    // how the image was written; try the documented unit first, then bytes.
    if (child) {
      const byUnit = walk(child, depth + 1);
      if (byUnit) return byUnit;
    }
    return null;
  };
  // Try both interpretations of the sibling units.
  const byUnits = walk(0, 0);
  if (byUnits) return byUnits;
  // Fallback: brute force every 4-byte aligned entry for the name.
  for (let start = 0; start + 14 <= table.length; start += 4) {
    const nameLength = table[start + 13];
    if (nameLength !== 11) continue;
    const name = table.toString('latin1', start + 14, start + 25);
    if (name.toLowerCase() !== 'default.xbe') continue;
    return { offset: table.readUInt32LE(start + 4) * 2048, size: table.readUInt32LE(start + 8) };
  }
  return null;
}

function xboxInfo(file: string): GameInfo {
  try {
    if (statSync(file).isDirectory()) {
      const xbe = path.join(file, 'default.xbe');
      return existsSync(xbe) ? xbeFileInfo(xbe) : {};
    }
  } catch {
    return {};
  }
  if (file.toLowerCase().endsWith('.xbe')) return xbeFileInfo(file);
  const found = xisoDefaultXbe(file);
  if (!found) return {};
  const head = readAt(file, found.offset, 0x10000);
  return head ? xbeInfoFromBuffer(head, 0) : {};
}

/* ------------------------------------------------------------------ 360 STFS */

function stfsInfo(file: string): GameInfo {
  const head = readAt(file, 0, 0x2000);
  if (!head) return {};
  const magic = head.toString('latin1', 0, 4);
  if (magic !== 'LIVE' && magic !== 'PIRS' && magic !== 'CON ') return {};
  const text = head.toString('utf16le');
  const skip = /installed game|original game disc|microsoft|xbox|http|system\.|content|license|media|avatar|title/i;
  let best: string | undefined;
  for (const match of text.matchAll(/[\u0020-\u007e\u4e00-\u9fff]{3,}/g)) {
    const value = match[0].trim();
    if (value.length < 3) continue;
    if (/^(LIVE|PIRS|CON )/.test(value)) continue;
    if (skip.test(value)) continue;
    if (/^[0-9A-F]{8}$/i.test(value)) continue;
    if (!best || value.length > best.length) best = value;
  }
  return { title: cleanTitle(best ?? '') };
}

/* ---------------------------------------------------------------- dispatch */

const INFO_READERS: Record<string, (file: string) => GameInfo> = {
  nds: ndsInfo,
  gba: gbaInfo,
  n64: n64Info,
  ngc: discInfo,
  wii: discInfo,
  ps3: (file) => (statSafeIsFile(path.join(file, 'PARAM.SFO')) ? sfoInfo(path.join(file, 'PARAM.SFO')) : sfoInfo(file)),
  xbox: xboxInfo,
  xbox360: stfsInfo,
  psp: (file) => {
    // EBOOT.PBP (PSN/homebrew) stores its PARAM.SFO inside the PBP container.
    if (statSafeIsFile(file)) return pbpInfo(file);
    const umd = path.join(file, 'PSP_GAME', 'PARAM.SFO');
    if (statSafeIsFile(umd)) return sfoInfo(umd);
    // PSN / homebrew folder: <title>/EBOOT.PBP carries the SFO inside the PBP.
    const eboot = path.join(file, 'EBOOT.PBP');
    if (statSafeIsFile(eboot)) return pbpInfo(eboot);
    const sfo = path.join(file, 'PARAM.SFO');
    if (statSafeIsFile(sfo)) return sfoInfo(sfo);
    return {};
  },
};

function statSafeIsFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

export function gameInfoFor(file: string, systemId: string): GameInfo {
  const reader = INFO_READERS[systemId];
  if (!reader) return {};
  try {
    const info = reader(file);
    return { ...(info.title ? { title: info.title } : {}), ...(info.region ? { region: info.region } : {}) };
  } catch {
    return {};
  }
}
