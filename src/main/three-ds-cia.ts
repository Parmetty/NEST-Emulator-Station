import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import crypto from 'node:crypto';
import { inspectCia } from './cia';

/**
 * Turns a retail/Chinese "titlekey-decrypted but NCCH-encrypted" CIA into a
 * genuinely installable CIA: every content is decrypted (titlekey CBC + NCCH
 * CTR), the NCCH NoCrypto flag is written, and the TMD content hashes are fixed.
 *
 * Azahar refuses anything whose NCCH still says "encrypted", so this is the
 * minimum Nest has to do before handing the file to azahar --install.
 */
export interface PrepareResult {
  ok: boolean;
  error?: string;
  /** Path to the installable CIA (source itself when it is already plaintext). */
  path?: string;
  titleId?: string;
  decrypted?: boolean;
}

const align64 = (n: number) => Math.ceil(n / 0x40) * 0x40;

function readRange(fd: number, offset: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  const read = readSync(fd, buffer, 0, length, offset);
  return buffer.subarray(0, read);
}

function beInt(buffer: Buffer): bigint {
  let value = 0n;
  for (const byte of buffer) value = (value << 8n) | BigInt(byte);
  return value;
}

const MASK = (1n << 128n) - 1n;
const rol = (value: bigint, bits: number) => ((value << BigInt(bits)) & MASK) | (value >> BigInt(128 - bits));

function keygen(keyX: bigint, keyY: bigint): Buffer {
  const inner = (rol(keyX, 2) ^ keyY) + 0x1ff9e9aac5fe0408024591dc5d52768an;
  const out = rol(inner & MASK, 87);
  return Buffer.from(out.toString(16).padStart(32, '0'), 'hex');
}

const COMMON_KEY_Y = [
  0xd07b337f9ca4385932a2e25723232eb9n,
  0x0c767230f0998f1c46828202faacbe4cn,
  0xc475cb3ab8c788bb575e12a10907b8a4n,
  0xe486eee3d0c09c902f6686d4c06f649fn,
  0xed31ba9c04b067506c4497a35b7804fcn,
  0x5e66998ab4e8931606850fd7a16dd755n,
];

/** Public retail keyX for the 7.x NCCH keyslot (0x25); needed by crypto_method=1 titles. */
const NCCH70_KEYX = 0xcee7d8ab30c00dae850ef5e382ac5af3n;

function ctrCounter(partition: bigint, section: number, delta: bigint): Buffer {
  let value = ((partition << 64n) | (BigInt(section) << 56n)) + delta;
  const out = Buffer.alloc(16);
  for (let i = 15; i >= 0; i -= 1) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

function ctrDecrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-128-ctr', key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function cbcDecrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

const yieldTick = () => new Promise<void>((resolve) => setImmediate(resolve));

export async function prepareInstallableCia(opts: {
  source: string;
  boot9: string;
  cacheDir: string;
}): Promise<PrepareResult> {
  const health = inspectCia(opts.source);
  if (health.issues.includes('uses-seed')) return { ok: false, error: 'cia-uses-seed' };
  if (!existsSync(opts.boot9)) return { ok: false, error: 'missing-3ds-boot9' };

  const boot = Buffer.alloc(0x10000);
  let bootRead = 0;
  const bootFd = openSync(opts.boot9, 'r');
  try {
    bootRead = readSync(bootFd, boot, 0, boot.length, 0);
    if (bootRead !== 0x10000 && bootRead !== 0x8000) return { ok: false, error: 'bad-3ds-boot9' };
  } finally {
    closeSync(bootFd);
  }
  const prot = bootRead === 0x10000 ? boot.subarray(0x8000, bootRead) : boot.subarray(0, bootRead);
  if (prot.length < 0x5c60) return { ok: false, error: 'bad-3ds-boot9' };
  const keyblob = prot.subarray(0x5860, 0x5c60);
  const keyX2c = beInt(keyblob.subarray(0x170, 0x180));

  const source = opts.source;
  const fileSize = statSync(source).size;
  const fdIn = openSync(source, 'r');
  const header = Buffer.alloc(0x20);
  readSync(fdIn, header, 0, 0x20, 0);
  const headerSize = header.readUInt32LE(0);
  const certSize = header.readUInt32LE(8);
  const ticketSize = header.readUInt32LE(12);
  const tmdSize = header.readUInt32LE(16);
  const metaSize = header.readUInt32LE(20);
  const contentSize = Number(header.readBigUInt64LE(0x18));
  const certOff = align64(headerSize);
  const ticketOff = certOff + align64(certSize);
  const tmdOff = ticketOff + align64(ticketSize);
  const contentOff = tmdOff + align64(tmdSize);
  const metaOff = contentOff + align64(contentSize);
  if (contentOff >= fileSize || metaOff > fileSize + 0x40) {
    closeSync(fdIn);
    return { ok: false, error: 'cia-malformed' };
  }

  const ticket = readRange(fdIn, ticketOff, ticketSize);
  const tmd = Buffer.from(readRange(fdIn, tmdOff, tmdSize));
  const tmdSig = tmd.readUInt32BE(0);
  const tmdY = tmdSig === 0x10004 ? 0x140 : 0x240;
  const chunkCount = tmd.readUInt16BE(tmdY + 0x9e);
  const titleIdBytes = ticket.subarray(0x1dc, 0x1e4);
  const commonKey = keygen(keyX2c, COMMON_KEY_Y[ticket[0x1f1]] ?? COMMON_KEY_Y[0]);
  const titlekey = cbcDecrypt(
    ticket.subarray(0x1bf, 0x1cf),
    commonKey,
    Buffer.concat([titleIdBytes, Buffer.alloc(8)]),
  );

  const chunks: Array<{ index: number; flags: number; size: number; tmdBase: number; offset: number }> = [];
  for (let i = 0; i < chunkCount; i += 1) {
    const base = tmdY + 0x9c4 + i * 0x30;
    chunks.push({
      index: tmd.readUInt16BE(base + 4),
      flags: tmd.readUInt16BE(base + 6),
      size: Number(tmd.readBigUInt64BE(base + 8)),
      tmdBase: base,
      offset: 0,
    });
  }
  let cursor = contentOff;
  for (const chunk of chunks) {
    chunk.offset = cursor;
    cursor += align64(chunk.size);
  }

  mkdirSync(opts.cacheDir, { recursive: true });
  const key = createHash('sha1')
    .update(path.resolve(source) + '|' + fileSize + '|' + statSync(source).mtimeMs)
    .digest('hex')
    .slice(0, 16);
  const outPath = path.join(opts.cacheDir, key + '.cia');
  const fdOut = openSync(outPath, 'w');

  const copyRange = (srcOff: number, length: number, dstOff: number) => {
    const buffer = Buffer.alloc(Math.min(8 * 1024 * 1024, length));
    let done = 0;
    while (done < length) {
      const read = readSync(fdIn, buffer, 0, Math.min(buffer.length, length - done), srcOff + done);
      if (read <= 0) break;
      writeSync(fdOut, buffer, 0, read, dstOff + done);
      done += read;
    }
  };

  try {
    copyRange(0, tmdOff, 0);
    const tmdOut = Buffer.from(tmd);
    for (const chunk of chunks) tmdOut.writeUInt16BE(chunk.flags & ~1, chunk.tmdBase + 6);
    writeSync(fdOut, tmdOut, 0, tmdOut.length, tmdOff);

    const processChunk = async (chunk: { index: number; flags: number; size: number; tmdBase: number; offset: number }): Promise<Buffer> => {
      const srcStart = chunk.offset;
      const readRaw = (start: number, length: number) => readRange(fdIn, srcStart + start, length);
      const cbcLayer = (data: Buffer, start: number) => {
        if (!(chunk.flags & 1)) return data;
        const iv = Buffer.alloc(16);
        if (start === 0) iv.writeUInt16BE(chunk.index, 0);
        else readSync(fdIn, iv, 0, 16, srcStart + start - 16);
        return cbcDecrypt(data, titlekey, iv);
      };
      const readPlain = (start: number, length: number) => cbcLayer(readRaw(start, length), start);

      const ncchHeader = readPlain(0, 0x200);
      const hash = createHash('sha256');
      const write = (data: Buffer, offset: number) => {
        writeSync(fdOut, data, 0, data.length, srcStart + offset);
        hash.update(data);
      };

      if (ncchHeader.toString('latin1', 0x100, 0x104) !== 'NCCH') {
        const plain = readPlain(0, chunk.size);
        write(plain, 0);
        return hash.digest();
      }

      const flags = ncchHeader.subarray(0x188, 0x190);
      const noCrypto = (flags[7] & 0x04) !== 0;
      const cryptoMethod = flags[3] & 0x0f;
      const partition = ncchHeader.readBigUInt64LE(0x108);
      const keyY = ncchHeader.subarray(0, 16);
      const mainKey = keygen(keyX2c, beInt(keyY));
      const extraKey = keygen(NCCH70_KEYX, beInt(keyY));
      const extheaderSize = ncchHeader.readUInt32LE(0x180);
      const exefsOff = ncchHeader.readUInt32LE(0x1a0) * 0x200;
      const exefsSize = ncchHeader.readUInt32LE(0x1a4) * 0x200;
      const romfsOff = ncchHeader.readUInt32LE(0x1b0) * 0x200;
      const romfsSize = ncchHeader.readUInt32LE(0x1b4) * 0x200;

      const patchedHeader = Buffer.from(ncchHeader);
      patchedHeader[0x18f] |= 0x04; // NoCrypto

      const sections: Array<{ name: string; off: number; size: number; section: number; key: Buffer }> = [];
      if (!noCrypto && extheaderSize === 0x400) sections.push({ name: 'exthdr', off: 0x200, size: 0x800, section: 1, key: mainKey });
      if (!noCrypto && exefsSize > 0) sections.push({ name: 'exefs', off: exefsOff, size: exefsSize, section: 2, key: mainKey });
      if (!noCrypto && romfsSize > 0) sections.push({ name: 'romfs', off: romfsOff, size: romfsSize, section: 3, key: cryptoMethod ? extraKey : mainKey });
      sections.sort((a, b) => a.off - b.off);

      let current = 0;
      for (const section of sections) {
        if (section.off > current) {
          if (current === 0) write(patchedHeader.subarray(0, Math.min(0x200, section.off)), 0);
          if (section.off > 0x200) write(readPlain(Math.max(current, 0x200), section.off - Math.max(current, 0x200)), Math.max(current, 0x200));
        }
        if (section.name === 'exefs') {
          const encrypted = readPlain(section.off, section.size);
          const plain = ctrDecrypt(encrypted, mainKey, ctrCounter(partition, 2, 0n));
          if (cryptoMethod) {
            for (let entry = 0; entry < 10; entry += 1) {
              const name = plain.subarray(entry * 0x10, entry * 0x10 + 8).toString('latin1').replace(/\0+$/, '');
              if (!name) continue;
              const entryOffset = plain.readUInt32LE(entry * 0x10 + 8);
              const entrySize = plain.readUInt32LE(entry * 0x10 + 12);
              if (name === 'icon' || name === 'banner') continue;
              const abs = 0x200 + entryOffset;
              const slice = ctrDecrypt(encrypted.subarray(abs, abs + entrySize), extraKey, ctrCounter(partition, 2, BigInt(abs >> 4)));
              slice.copy(plain, abs);
            }
          }
          write(plain, section.off);
        } else {
          const step = 8 * 1024 * 1024;
          for (let done = 0; done < section.size; done += step) {
            const length = Math.min(step, section.size - done);
            const encrypted = readPlain(section.off + done, length);
            const iv = ctrCounter(partition, section.section, BigInt(done >> 4));
            write(ctrDecrypt(encrypted, section.key, iv), section.off + done);
            await yieldTick();
          }
        }
        current = section.off + section.size;
      }
      if (current < chunk.size) write(readPlain(current, chunk.size - current), current);
      return hash.digest();
    };

    for (const chunk of chunks) {
      await yieldTick();
      const digest = await processChunk(chunk);
      tmdOut.fill(0, chunk.tmdBase + 0x10, chunk.tmdBase + 0x30);
      digest.copy(tmdOut, chunk.tmdBase + 0x10);
    }
    const chunkRecords = Buffer.alloc(chunkCount * 0x30);
    for (let i = 0; i < chunkCount; i += 1) {
      tmdOut.copy(chunkRecords, i * 0x30, tmdY + 0x9c4 + i * 0x30, tmdY + 0x9c4 + (i + 1) * 0x30);
    }
    createHash('sha256').update(chunkRecords).digest().copy(tmdOut, tmdY + 0xc4 + 4);
    writeSync(fdOut, tmdOut, 0, tmdOut.length, tmdOff);

    if (metaSize) copyRange(metaOff, metaSize, metaOff);
  } catch (error) {
    console.error('[nest] 3ds decrypt failed', error);
    return { ok: false, error: '3ds-decrypt-failed' };
  } finally {
    closeSync(fdIn);
    closeSync(fdOut);
  }

  console.log('[nest] 3ds CIA decrypted -> ' + outPath + ' (' + (statSync(outPath).size / 0x40000000).toFixed(2) + ' GB)');
  return { ok: true, path: outPath, titleId: health.titleId, decrypted: true };
}
