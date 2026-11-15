import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectCia } from '../src/main/cia';

interface CiaOptions {
  titleId?: string;
  contentEncrypted?: boolean;
  /** undefined means "not an NCCH at all" */
  ncch?: { noCrypto: boolean; cryptoMethod?: number; usesSeed?: boolean };
}

const align64 = (n: number) => Math.ceil(n / 0x40) * 0x40;

function makeCia(options: CiaOptions = {}): { buffer: Buffer; contentOffset: number } {
  const headerSize = 0x2020;
  const certSize = 0x100;
  const ticketSize = 0x350;
  const tmdSize = 0xc00;
  const certOffset = align64(headerSize);
  const ticketOffset = certOffset + align64(certSize);
  const tmdOffset = ticketOffset + align64(ticketSize);
  const contentOffset = tmdOffset + align64(tmdSize);
  const content = Buffer.alloc(0x400);
  if (options.ncch) {
    content.write('NCCH', 0x100, 'latin1');
    content.writeUInt32LE(2, 0x104); // 2 media units
    content.writeUInt32LE(0x400, 0x180); // extended header size
    content.writeUInt8(options.ncch.cryptoMethod ?? 0, 0x18b);
    content.writeUInt8(
      (options.ncch.noCrypto ? 0x04 : 0) | (options.ncch.usesSeed ? 0x20 : 0),
      0x18f,
    );
  } else {
    content.fill(0x5a);
  }
  const buffer = Buffer.alloc(contentOffset + content.length);
  buffer.writeUInt32LE(headerSize, 0x00);
  buffer.writeUInt32LE(certSize, 0x08);
  buffer.writeUInt32LE(ticketSize, 0x0c);
  buffer.writeUInt32LE(tmdSize, 0x10);
  buffer.writeUInt32LE(0, 0x14);
  buffer.writeBigUInt64LE(BigInt(content.length), 0x18);

  const titleId = options.titleId ?? '000400000004B500';
  buffer.write(titleId, ticketOffset + 0x1dc, 'hex');
  buffer.writeUInt8(0, ticketOffset + 0x1f1);

  buffer.writeUInt32BE(0x00010004, tmdOffset);
  buffer.write(titleId, tmdOffset + 0x140 + 0x4c, 'hex');
  buffer.writeUInt16BE(7, tmdOffset + 0x140 + 0x9c);
  buffer.writeUInt16BE(1, tmdOffset + 0x140 + 0x9e);
  const chunk = tmdOffset + 0x140 + 0x9c4;
  buffer.writeUInt16BE(0, chunk + 4);
  buffer.writeUInt16BE(options.contentEncrypted ? 1 : 0, chunk + 6);
  buffer.writeBigUInt64LE(BigInt(content.length), chunk + 8);

  content.copy(buffer, contentOffset);
  return { buffer, contentOffset };
}

async function tempCia(buffer: Buffer): Promise<{ file: string; dir: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-cia-'));
  const file = path.join(dir, 'game.cia');
  await writeFile(file, buffer);
  return { file, dir };
}

describe('3DS CIA inspection', () => {
  it('accepts a fully decrypted (NoCrypto) NCCH', async () => {
    const { file, dir } = await tempCia(makeCia({ ncch: { noCrypto: true } }).buffer);
    const info = inspectCia(file);
    expect(info.ok).toBe(true);
    expect(info.issues).toEqual([]);
    expect(info.titleId).toBe('000400000004B500');
    expect(info.titleVersion).toBe(7);
    expect(info.ncch?.noCrypto).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('flags titlekey-encrypted content before it tries to read an NCCH', async () => {
    const { file, dir } = await tempCia(makeCia({ contentEncrypted: true }).buffer);
    const info = inspectCia(file);
    expect(info.ok).toBe(false);
    expect(info.issues).toContain('content-encrypted');
    await rm(dir, { recursive: true, force: true });
  });

  it('flags an NCCH that still has internal crypto (the Azahar blocking case)', async () => {
    const { file, dir } = await tempCia(
      makeCia({ ncch: { noCrypto: false, cryptoMethod: 1 } }).buffer,
    );
    const info = inspectCia(file);
    expect(info.ok).toBe(false);
    expect(info.issues).toContain('ncch-encrypted');
    expect(info.ncch?.cryptoMethod).toBe(1);
    await rm(dir, { recursive: true, force: true });
  });

  it('flags seed crypto so the UI can ask for seeddb.bin', async () => {
    const { file, dir } = await tempCia(
      makeCia({ ncch: { noCrypto: false, usesSeed: true } }).buffer,
    );
    const info = inspectCia(file);
    expect(info.issues).toContain('uses-seed');
    await rm(dir, { recursive: true, force: true });
  });

  it('flags content that is not an NCCH at all', async () => {
    const { file, dir } = await tempCia(makeCia().buffer);
    const info = inspectCia(file);
    expect(info.ok).toBe(false);
    expect(info.issues).toContain('content-not-ncch');
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects files that are not CIA containers', async () => {
    const { file, dir } = await tempCia(Buffer.alloc(0x100, 1));
    expect(inspectCia(file).ok).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
