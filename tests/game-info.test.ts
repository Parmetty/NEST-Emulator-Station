import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gameInfoFor } from '../src/main/game-info';

async function tempFile(name: string, buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-info-'));
  const file = path.join(dir, name);
  await writeFile(file, buffer);
  return file;
}

describe('game metadata sniffing', () => {
  it('reads the NDS header title and region', async () => {
    const buffer = Buffer.alloc(0x200);
    buffer.write('Test Game', 0, 'latin1');
    buffer.write('TEST', 0x0c, 'latin1');
    buffer[0x0f] = 'E'.charCodeAt(0);
    const file = await tempFile('game.nds', buffer);
    const info = gameInfoFor(file, 'nds');
    expect(info.title).toBe('Test Game');
    expect(info.region).toBe('NTSC-U');
    await rm(path.dirname(file), { recursive: true, force: true });
  });

  it('reads the GBA header title and region', async () => {
    const buffer = Buffer.alloc(0xb0);
    buffer.write('Pocket Game', 0xa0, 'latin1');
    buffer.write('AGBJ', 0xac, 'latin1');
    const file = await tempFile('game.gba', buffer);
    const info = gameInfoFor(file, 'gba');
    expect(info.title).toBe('Pocket Game');
    expect(info.region).toBe('NTSC-J');
    await rm(path.dirname(file), { recursive: true, force: true });
  });

  it('reads the N64 country code', async () => {
    const buffer = Buffer.alloc(0x40);
    buffer.writeUInt32BE(0x80371240, 0);
    buffer[0x3e] = 1;
    const file = await tempFile('game.z64', buffer);
    expect(gameInfoFor(file, 'n64').region).toBe('NTSC-U');
    await rm(path.dirname(file), { recursive: true, force: true });
  });

  it('reads the GameCube/Wii region byte', async () => {
    const gc = Buffer.alloc(0x20);
    gc.write('GALE', 0, 'latin1');
    const gcFile = await tempFile('game.gcm', gc);
    expect(gameInfoFor(gcFile, 'ngc').region).toBe('NTSC-U');
    await rm(path.dirname(gcFile), { recursive: true, force: true });
  });

  it('reads TITLE and TITLE_ID from a PS3 PARAM.SFO', async () => {
    // Minimal SFO: header + TITLE (utf8) + TITLE_ID (utf8).
    const keys = Buffer.from('TITLE\0TITLE_ID\0', 'latin1');
    const values = Buffer.concat([Buffer.from('Steins;Gate 0\0', 'utf8'), Buffer.from('BLJM61303\0', 'latin1')]);
    const header = Buffer.alloc(0x14 + 2 * 16);
    header.write('\0PSF', 0, 'latin1');
    header.writeUInt32LE(0x101, 4);
    header.writeUInt32LE(header.length, 8);
    header.writeUInt32LE(header.length + keys.length, 12);
    header.writeUInt32LE(2, 16);
    header.writeUInt16LE(0, 0x14);
    header.writeUInt16LE(0x0204, 0x16);
    header.writeUInt32LE(14, 0x18);
    header.writeUInt32LE(14, 0x1c);
    header.writeUInt32LE(0, 0x20);
    header.writeUInt16LE(6, 0x24);
    header.writeUInt16LE(0x0204, 0x26);
    header.writeUInt32LE(10, 0x28);
    header.writeUInt32LE(10, 0x2c);
    header.writeUInt32LE(14, 0x30);
    const file = await tempFile('PARAM.SFO', Buffer.concat([header, keys, values]));
    const info = gameInfoFor(file, 'ps3');
    expect(info.title).toBe('Steins;Gate 0');
    expect(info.region).toBe('NTSC-J');
    await rm(path.dirname(file), { recursive: true, force: true });
  });

  it('reads title and region from an Xbox XBE certificate', async () => {
    const buffer = Buffer.alloc(0x2000);
    buffer.write('XBEH', 0, 'latin1');
    buffer.writeUInt32LE(0x10000, 0x104); // base address
    buffer.writeUInt32LE(0x11000, 0x118); // certificate virtual address
    const cert = 0x1000;
    buffer.write('Halo 2', cert + 0x0c, 'utf16le');
    buffer.writeUInt32LE(1, cert + 0xa0);
    const file = await tempFile('default.xbe', buffer);
    const info = gameInfoFor(file, 'xbox');
    expect(info.title).toBe('Halo 2');
    expect(info.region).toBe('NTSC-U');
    await rm(path.dirname(file), { recursive: true, force: true });
  });

  it('reads the STFS display name for a GOD package', async () => {
    const buffer = Buffer.alloc(0x2000);
    buffer.write('LIVE', 0, 'latin1');
    buffer.write('Forza Horizon 2', 0x400, 'utf16le');
    const file = await tempFile('header', buffer);
    expect(gameInfoFor(file, 'xbox360').title).toBe('Forza Horizon 2');
    await rm(path.dirname(file), { recursive: true, force: true });
  });
});
