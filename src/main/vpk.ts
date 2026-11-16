import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

interface Entry {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
}

function readRange(fd: number, offset: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  const read = readSync(fd, buffer, 0, length, offset);
  return buffer.subarray(0, read);
}

/** Extract a VPK (plain zip) into a folder; Vita3K's folder install is more tolerant than its VPK installer. */
export function extractVpk(vpk: string, dest: string): boolean {
  const fd = openSync(vpk, 'r');
  try {
    const size = statSync(vpk).size;
    const tailLen = Math.min(size, 0x10000 + 0x22);
    const tail = readRange(fd, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 0x16; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return false;
    const count = tail.readUInt16LE(eocd + 0x0a);
    const cdSize = tail.readUInt32LE(eocd + 0x0c);
    const cdOffset = tail.readUInt32LE(eocd + 0x10);
    const cd = readRange(fd, cdOffset, Math.min(cdSize + 0x1000, 64 * 1024 * 1024));
    const entries: Entry[] = [];
    let p = 0;
    for (let i = 0; i < count && p + 0x2e <= cd.length; i += 1) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const nameLen = cd.readUInt16LE(p + 0x1c);
      const extraLen = cd.readUInt16LE(p + 0x1e);
      const commentLen = cd.readUInt16LE(p + 0x20);
      entries.push({
        name: cd.toString('latin1', p + 0x2e, p + 0x2e + nameLen),
        method: cd.readUInt16LE(p + 0x0a),
        compSize: cd.readUInt32LE(p + 0x14),
        localOffset: cd.readUInt32LE(p + 0x2a),
      });
      p += 0x2e + nameLen + extraLen + commentLen;
    }
    if (entries.length === 0) return false;
    const root = path.resolve(dest);
    for (const entry of entries) {
      const target = path.resolve(root, entry.name);
      if (!target.startsWith(root + path.sep) && target !== root) continue;
      if (entry.name.endsWith('/')) {
        mkdirSync(target, { recursive: true });
        continue;
      }
      const local = readRange(fd, entry.localOffset, 0x1e);
      if (local.length < 0x1e) continue;
      const nameLen = local.readUInt16LE(0x1a);
      const extraLen = local.readUInt16LE(0x1c);
      const data = readRange(fd, entry.localOffset + 0x1e + nameLen + extraLen, entry.compSize);
      let body: Buffer;
      if (entry.method === 0) body = data;
      else if (entry.method === 8) body = inflateRawSync(data);
      else continue;
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
    return existsSync(path.join(root, 'eboot.bin')) || existsSync(path.join(root, 'sce_sys', 'param.sfo'));
  } catch {
    return false;
  } finally {
    closeSync(fd);
  }
}

/** Cache an extracted VPK by source identity so repeat launches skip the unzip. */
export function ensureVpkExtracted(vpk: string, cacheRoot: string): string | null {
  const stat = statSync(vpk);
  const key = createHash('sha1').update(vpk + '|' + stat.size + '|' + stat.mtimeMs).digest('hex').slice(0, 16);
  const dest = path.join(cacheRoot, key);
  if (existsSync(path.join(dest, 'eboot.bin')) || existsSync(path.join(dest, 'sce_sys', 'param.sfo'))) return dest;
  mkdirSync(cacheRoot, { recursive: true });
  return extractVpk(vpk, dest) ? dest : null;
}
