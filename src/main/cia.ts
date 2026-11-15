import { closeSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Fast 3DS CIA health check.
 *
 * Only header/ticket/TMD/first-NCCH bytes are read (a few KB), so this is safe
 * to run at scan time or launch time. It answers the questions Azahar will
 * otherwise fail on deep inside: is the container self-consistent, is the
 * content titlekey-encrypted, and is the inner NCCH already plaintext?
 */
export interface CiaNcch {
  present: boolean;
  noCrypto: boolean;
  /** NCCH crypto method: 0 = NCCH keyslot, 1 = NCCH70 (7.x), 0xA/0xB = New3DS. */
  cryptoMethod: number;
  usesSeed: boolean;
  contentSize?: number;
  extheaderSize?: number;
}

export interface CiaHealth {
  ok: boolean;
  error?: string;
  titleId?: string;
  titleVersion?: number;
  headerSize?: number;
  certSize?: number;
  ticketSize?: number;
  tmdSize?: number;
  metaSize?: number;
  contentSize?: number;
  /** TMD chunk 0 says the stored content is AES-CBC (titlekey) encrypted. */
  contentEncrypted?: boolean;
  contentOffset?: number;
  tmdOffset?: number;
  ncch?: CiaNcch;
  /** Stable issue codes the UI can translate; empty means "ready to boot/install". */
  issues: string[];
}

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

const align64 = (value: number) => Math.ceil(value / 0x40) * 0x40;
const NCCH_MAGIC = 'NCCH';

export function inspectCia(file: string): CiaHealth {
  const issues: string[] = [];
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    return { ok: false, error: 'stat-failed', issues: ['not-a-cia'] };
  }
  if (size < 0x1000) return { ok: false, error: 'too-small', issues: ['not-a-cia'] };

  const header = readRange(file, 0, 0x20);
  if (header.length < 0x20) return { ok: false, error: 'short-header', issues: ['not-a-cia'] };
  const headerSize = header.readUInt32LE(0x00);
  const certSize = header.readUInt32LE(0x08);
  const ticketSize = header.readUInt32LE(0x0c);
  const tmdSize = header.readUInt32LE(0x10);
  const metaSize = header.readUInt32LE(0x14);
  const contentSize = Number(header.readBigUInt64LE(0x18));
  if (headerSize < 0x1000 || headerSize > 0x40000 || certSize === 0 || ticketSize === 0 || tmdSize < 0x100) {
    return {
      ok: false,
      error: 'not-a-cia',
      issues: ['not-a-cia'],
      headerSize,
      certSize,
      ticketSize,
      tmdSize,
      metaSize,
    };
  }

  const certOffset = align64(headerSize);
  const ticketOffset = certOffset + align64(certSize);
  const tmdOffset = ticketOffset + align64(ticketSize);
  const contentOffset = tmdOffset + align64(tmdSize);
  const result: CiaHealth = {
    ok: true,
    headerSize,
    certSize,
    ticketSize,
    tmdSize,
    metaSize,
    contentSize,
    contentOffset,
    tmdOffset,
    issues,
  };
  if (contentOffset >= size) {
    result.ok = false;
    result.error = 'truncated';
    issues.push('truncated');
    return result;
  }

  const ticket = readRange(file, ticketOffset, Math.min(ticketSize, 0x400));
  if (ticket.length >= 0x1e4) {
    result.titleId = ticket.subarray(0x1dc, 0x1e4).toString('hex').toUpperCase();
  }

  const tmd = readRange(file, tmdOffset, Math.min(tmdSize, 0x4000));
  const sigType = tmd.length >= 4 ? tmd.readUInt32BE(0) : 0;
  const sigDataSize = sigType === 0x10003 ? 0x240 : 0x140;
  if (tmd.length >= sigDataSize + 0xa4) {
    const tmdTitle = tmd.subarray(sigDataSize + 0x4c, sigDataSize + 0x54).toString('hex').toUpperCase();
    if (!result.titleId) result.titleId = tmdTitle;
    const titleVersion = tmd.readUInt16BE(sigDataSize + 0x9c);
    result.titleVersion = titleVersion;
    const contentCount = tmd.readUInt16BE(sigDataSize + 0x9e);
    if (contentCount > 0) {
      const chunkBase = sigDataSize + 0x9c4;
      if (tmd.length >= chunkBase + 0x30) {
        const index = tmd.readUInt16BE(chunkBase + 4);
        const flags = tmd.readUInt16BE(chunkBase + 6);
        result.contentEncrypted = (flags & 0x1) === 0x1;
        if (result.contentEncrypted) issues.push('content-encrypted');
        void index;
      }
    } else {
      issues.push('tmd-empty');
    }
  } else {
    issues.push('tmd-invalid');
  }

  // Read the NCCH header that should sit at the (aligned) content offset.
  const ncchHeader = readRange(file, contentOffset, 0x200);
  if (ncchHeader.length >= 0x200 && ncchHeader.toString('latin1', 0x100, 0x104) === NCCH_MAGIC) {
    const flags = ncchHeader.subarray(0x188, 0x190);
    const ncch: CiaNcch = {
      present: true,
      noCrypto: (flags[7] & 0x04) !== 0,
      cryptoMethod: flags[3] & 0x0f,
      usesSeed: (flags[7] & 0x20) !== 0,
      contentSize: ncchHeader.readUInt32LE(0x104) * 0x200,
      extheaderSize: ncchHeader.readUInt32LE(0x180),
    };
    result.ncch = ncch;
    if (!ncch.noCrypto) issues.push('ncch-encrypted');
    if (ncch.usesSeed) issues.push('uses-seed');
    if (ncch.cryptoMethod !== 0 && ncch.cryptoMethod !== 1) issues.push('ncch-extra-keyslot');
  } else {
    result.ncch = { present: false, noCrypto: false, cryptoMethod: 0, usesSeed: false };
    if (!result.contentEncrypted) issues.push('content-not-ncch');
  }

  if (issues.length > 0 && result.ok) result.ok = false;
  if (issues.length > 0) result.error = issues[0];
  return result;
}

export function ciaBasename(file: string): string {
  return path.basename(file);
}
