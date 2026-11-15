import { closeSync, openSync, readSync, statSync } from 'node:fs';

/**
 * 3DS CIA inspection.
 *
 * Azahar refuses to install "unauthorized encrypted" CIAs (error d8a08004):
 * eShop-style dumps keep the NCCH payload encrypted with a ticket title key,
 * which the emulator cannot legally decrypt. Nest must tell the player that
 * before the install fails deep inside the emulator.
 */
export interface CiaInfo {
  /** False when the file is not a CIA or the header is unreadable. */
  ok: boolean;
  error?: string;
  /** 'game' | 'dlc' | 'patch' | 'system' — from the ticket/type when known. */
  encrypted?: boolean;
  titleId?: string;
  titleVersion?: number;
  contentSize?: number;
  headerSize?: number;
  /** Offset of the first content (NCCH) in the container. */
  contentOffset?: number;
}

/** Read a byte range without loading the whole (often >1 GB) file. */
function readRange(file: string, offset: number, length: number): Buffer {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const read = readSync(fd, buffer, 0, length, offset);
    return buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

const NCCH_MAGIC = 'NCCH';

export function inspectCia(file: string): CiaInfo {
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    return { ok: false, error: 'stat-failed' };
  }
  if (size < 0x2020) return { ok: false, error: 'not-a-cia' };

  const header = readRange(file, 0, 0x20);
  if (header.length < 0x20) return { ok: false, error: 'not-a-cia' };
  const headerSize = header.readUInt32LE(0x00);
  const certSize = header.readUInt32LE(0x08);
  const ticketSize = header.readUInt32LE(0x0c);
  const tmdSize = header.readUInt32LE(0x10);
  const metaSize = header.readUInt32LE(0x14);
  const contentSize = Number(header.readBigUInt64LE(0x18));
  // Real CIAs use a 0x2020 header; anything else is not a CIA container.
  if (headerSize < 0x1000 || headerSize > 0x40000 || !Number.isFinite(contentSize)) {
    return { ok: false, error: 'not-a-cia' };
  }
  const contentOffset = headerSize + certSize + ticketSize + tmdSize + metaSize;
  if (contentOffset >= size) return { ok: false, error: 'bad-content-offset' };

  const info: CiaInfo = {
    ok: true,
    headerSize,
    contentSize,
    contentOffset,
  };

  // Name, version and title id live in the TMD; the title id sits in the TMD
  // header and is the reliable marker here (certificates share the layout but
  // are outside the TMD range).
  if (tmdSize > 0 && tmdSize < 0x100000) {
    const tmd = readRange(file, headerSize + certSize + ticketSize, tmdSize);
    for (let i = 0; i + 0x0c <= tmd.length; i += 1) {
      if (tmd[i] === 0x00 && tmd[i + 1] === 0x04 && tmd[i + 2] === 0x00 && tmd[i + 3] === 0x00) {
        info.titleId = tmd.subarray(i, i + 8).toString('hex').toUpperCase();
        info.titleVersion = tmd.readUInt16BE(i + 8);
        break;
      }
    }
  }

  // The first content is an NCCH. A valid plaintext NCCH starts with "NCCH";
  // encrypted content starts with the exheader nonce, so no magic is visible.
  const magic = readRange(file, contentOffset, 4);
  info.encrypted = magic.length < 4 || magic.toString('latin1') !== NCCH_MAGIC;
  return info;
}
