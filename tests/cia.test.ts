import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectCia } from '../src/main/cia';

function makeCia(options: { encrypted: boolean; titleId?: string }): Buffer {
  const headerSize = 0x2020;
  const tmdSize = 0x400;
  const metaSize = 0x40;
  const contentOffset = headerSize + tmdSize + metaSize;
  const content = Buffer.alloc(0x100);
  if (!options.encrypted) content.write('NCCH', 0, 'latin1');
  else content.fill(0x5a);
  const buffer = Buffer.alloc(contentOffset + content.length);
  buffer.writeUInt32LE(headerSize, 0x00);
  buffer.writeUInt32LE(0, 0x08); // cert
  buffer.writeUInt32LE(0, 0x0c); // ticket
  buffer.writeUInt32LE(tmdSize, 0x10);
  buffer.writeUInt32LE(metaSize, 0x14);
  buffer.writeBigUInt64LE(BigInt(content.length), 0x18);
  const titleId = options.titleId ?? '000400000004B500';
  const tmdOffset = headerSize;
  buffer.write(titleId, tmdOffset + 0x1dc, 'hex');
  buffer.writeUInt16BE(0x0020, tmdOffset + 0x1e4);
  content.copy(buffer, contentOffset);
  return buffer;
}

async function tempCia(buffer: Buffer): Promise<{ file: string; dir: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-cia-'));
  const file = path.join(dir, 'game.cia');
  await writeFile(file, buffer);
  return { file, dir };
}

describe('3DS CIA inspection', () => {
  it('flags an encrypted CIA and reads its title id', async () => {
    const { file, dir } = await tempCia(makeCia({ encrypted: true, titleId: '000400000004B500' }));
    const info = inspectCia(file);
    expect(info.ok).toBe(true);
    expect(info.encrypted).toBe(true);
    expect(info.titleId).toBe('000400000004B500');
    await rm(dir, { recursive: true, force: true });
  });

  it('accepts a decrypted CIA (NCCH content)', async () => {
    const { file, dir } = await tempCia(makeCia({ encrypted: false, titleId: '0004000000123400' }));
    const info = inspectCia(file);
    expect(info.ok).toBe(true);
    expect(info.encrypted).toBe(false);
    expect(info.titleId).toBe('0004000000123400');
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects files that are not CIA containers', async () => {
    const { file, dir } = await tempCia(Buffer.alloc(0x100, 1));
    expect(inspectCia(file).ok).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
