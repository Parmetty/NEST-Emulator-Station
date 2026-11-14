import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EXT_TO_SYSTEM, scanFolder, systemForFile } from '../src/main/scanner';

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'nest-scan-'));
  dirs.push(dir);
  return dir;
}

/** 0x18 magic controls the GC/Wii decision for .iso/.rvz/.gcz/.ciso images. */
async function writeIso(dir: string, name: string, magic: number): Promise<string> {
  const buffer = Buffer.alloc(0x30);
  buffer.writeUInt32BE(magic, 0x18);
  const file = path.join(dir, name);
  await writeFile(file, buffer);
  return file;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('scanner extensions', () => {
  it('maps the 3DS installer format, which the old table missed', () => {
    expect(EXT_TO_SYSTEM.cia).toBe('3ds');
    expect(EXT_TO_SYSTEM['3dsx']).toBe('3ds');
    expect(EXT_TO_SYSTEM.cci).toBe('3ds');
  });

  it('covers DS and N64-adjacent formats people actually keep on disk', () => {
    // DSiWares still live in the NDS family; the model picker decides whether
    // melonDS runs as a DS or a DSi.
    expect(EXT_TO_SYSTEM.dsi).toBe('nds');
    expect(EXT_TO_SYSTEM.ids).toBe('nds');
    expect(EXT_TO_SYSTEM.srl).toBe('nds');
  });

  it('maps PSP disc formats and recognizes PSP ISO markers', async () => {
    expect(EXT_TO_SYSTEM.cso).toBe('psp');
    expect(EXT_TO_SYSTEM.elf).toBe('psp');

    const dir = await tempDir();
    const buffer = Buffer.alloc(0x2000);
    buffer.write('PSP GAME', 0x100, 'latin1');
    const fake = path.join(dir, 'fake-psp.iso');
    await writeFile(fake, buffer);
    expect(await systemForFile(fake)).toBe('psp');
  });

  it('maps PS1 disc formats', () => {
    expect(EXT_TO_SYSTEM.cue).toBe('ps1');
    expect(EXT_TO_SYSTEM.chd).toBe('ps1');
    expect(EXT_TO_SYSTEM.pbp).toBe('ps1');
    expect(EXT_TO_SYSTEM.mds).toBe('ps1');
    expect(EXT_TO_SYSTEM.ccd).toBe('ps1');
    expect(EXT_TO_SYSTEM.wia).toBe('wii');
    expect(EXT_TO_SYSTEM.gcz).toBe('ngc');
  });

  it('tells a GameCube ISO from a Wii ISO by header magic', async () => {
    const dir = await tempDir();
    const gc = await writeIso(dir, 'game.gcm', 0xc2339f3f);
    const gcIso = await writeIso(dir, 'game-gc.iso', 0xc2339f3f);
    const wiiIso = await writeIso(dir, 'game-wii.iso', 0x5d1c9ea3);
    const unknown = await writeIso(dir, 'game-unknown.iso', 0);

    expect(await systemForFile(gc)).toBe('ngc');
    expect(await systemForFile(gcIso)).toBe('ngc');
    expect(await systemForFile(wiiIso)).toBe('wii');
    // Unknown magic falls back to the extension table instead of dropping the file.
    expect(await systemForFile(unknown)).toBe('ngc');
  });

  it('recognises a PS2 ISO by its PLAYSTATION marker', async () => {
    const dir = await tempDir();
    const buffer = Buffer.alloc(0x2000);
    buffer.write('PLAYSTATION', 0x100, 'latin1');
    const fake = path.join(dir, 'fake-ps2.iso');
    await writeFile(fake, buffer);
    expect(await systemForFile(fake)).toBe('ps2');

    // A random ISO without the marker still falls back to the old GC default.
    const blank = await writeIso(dir, 'blank.iso', 0);
    expect(await systemForFile(blank)).toBe('ngc');
  });

  it('scans subfolders and files mixed together', async () => {
    const root = await tempDir();
    const nested = path.join(root, 'roms', 'gba');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, 'x.cia'), 'cia');
    await writeFile(path.join(nested, 'y.gba'), 'gba');

    const found = await scanFolder(root);
    const bySystem = found.map((file) => file.systemId).sort();
    expect(bySystem).toEqual(['3ds', 'gba']);
  });

  it('recognizes a PS3 game folder', async () => {
    const root = await tempDir();
    const game = path.join(root, 'BLAS50497-[Crysis3]');
    await mkdir(path.join(game, 'USRDIR'), { recursive: true });
    await writeFile(path.join(game, 'PARAM.SFO'), 'SFO');

    const found = await scanFolder(root);
    expect(found).toHaveLength(1);
    expect(found[0].systemId).toBe('ps3');
    expect(found[0].path).toBe(game);
  });

  it('recognises an Xbox XISO image by its XDVDFS marker', async () => {
    const dir = await tempDir();
    const buffer = Buffer.alloc(0x10000 + 64);
    buffer.write('MICROSOFT*XBOX*MEDIA', 0x10000, 'latin1');
    const xiso = path.join(dir, 'Halo.iso');
    await writeFile(xiso, buffer);
    expect(await systemForFile(xiso)).toBe('xbox');
  });

  it('maps bare .xbe files to the Xbox family', () => {
    expect(EXT_TO_SYSTEM.xbe).toBe('xbox');
  });

  it('recognizes PSP UMD images even when the volume label is empty', async () => {
    const root = await tempDir();
    const image = Buffer.alloc(0x10020);
    image.write('PSP_GAME', 0x9000, 'latin1');
    await writeFile(path.join(root, 'Crisis Core.ISO'), image);

    const found = await scanFolder(root);
    expect(found).toHaveLength(1);
    expect(found[0].systemId).toBe('psp');
    expect(await scanFolder(root, { systemId: 'psp' })).toHaveLength(1);
  });

  it('recognizes an extracted PSP UMD folder as one game', async () => {
    const root = await tempDir();
    const game = path.join(root, 'sub', 'Crisis Core');
    await mkdir(path.join(game, 'PSP_GAME', 'SYSDIR'), { recursive: true });
    
    await writeFile(path.join(game, 'PSP_GAME', 'PARAM.SFO'), sfoBuffer('Crisis Core -Final Fantasy VII-', 'ULJM-05221'));
    await writeFile(path.join(game, 'PSP_GAME', 'SYSDIR', 'EBOOT.BIN'), 'decrypted');
    await writeFile(path.join(game, 'UMD_DATA.BIN'), 'ULJM-05221');

    const found = await scanFolder(root);
    expect(found).toHaveLength(1);
    expect(found[0].systemId).toBe('psp');
    expect(found[0].path).toBe(game);
    expect(found[0].title).toBe('Crisis Core -Final Fantasy VII-');
    expect(found[0].region).toBe('NTSC-J');
  });

  it('recognizes a PSN/homebrew PSP folder and boots its EBOOT.PBP', async () => {
    const root = await tempDir();
    const game = path.join(root, 'PSP', 'GAME', 'NPJH50311');
    await mkdir(game, { recursive: true });
    const sfo = sfoBuffer('Crisis Core PSN', 'NPJH-50311');
    const header = Buffer.alloc(0x28);
    header.write('\0PBP', 0, 'latin1');
    header.writeUInt32LE(0x00010000, 4);
    header.writeUInt32LE(0x28, 0x08);
    await writeFile(path.join(game, 'EBOOT.PBP'), Buffer.concat([header, sfo]));

    const found = await scanFolder(root, { systemId: 'psp' });
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe(path.join(game, 'EBOOT.PBP'));
    expect(found[0].title).toBe('Crisis Core PSN');
  });

function sfoBuffer(title: string, discId: string): Buffer {
  const keys = Buffer.from('TITLE\0DISC_ID\0', 'latin1');
  const titleValue = Buffer.from(title + '\0', 'utf8');
  const discValue = Buffer.from(discId + '\0', 'latin1');
  const values = Buffer.concat([titleValue, discValue]);
  const header = Buffer.alloc(0x14 + 2 * 16);
  header.write('\0PSF', 0, 'latin1');
  header.writeUInt32LE(0x101, 4);
  header.writeUInt32LE(header.length, 8);
  header.writeUInt32LE(header.length + keys.length, 12);
  header.writeUInt32LE(2, 16);
  header.writeUInt16LE(0, 0x14);
  header.writeUInt16LE(0x0204, 0x16);
  header.writeUInt32LE(titleValue.length, 0x18);
  header.writeUInt32LE(titleValue.length, 0x1c);
  header.writeUInt32LE(0, 0x20);
  header.writeUInt16LE(6, 0x24);
  header.writeUInt16LE(0x0204, 0x26);
  header.writeUInt32LE(discValue.length, 0x28);
  header.writeUInt32LE(discValue.length, 0x2c);
  header.writeUInt32LE(titleValue.length, 0x30);
  return Buffer.concat([header, keys, values]);
}
  it('keeps a packed Xbox folder as one entry by skipping its sibling ISO', async () => {
    const root = await tempDir();
    const folder = path.join(root, 'Halo 2');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'default.xbe'), 'xbe');
    const image = Buffer.alloc(0x10000 + 32);
    image.write('MICROSOFT*XBOX*MEDIA', 0x10000, 'latin1');
    await writeFile(path.join(root, 'Halo 2.iso'), image);

    const found = await scanFolder(root);
    const xbox = found.filter((file) => file.systemId === 'xbox');
    expect(xbox).toHaveLength(1);
    expect(xbox[0].path).toBe(folder);
  });

  it('recognizes an unpacked Xbox folder with default.xbe', async () => {
    const root = await tempDir();
    const game = path.join(root, 'Halo CE');
    await mkdir(game, { recursive: true });
    await writeFile(path.join(game, 'default.xbe'), 'xbe');
    const found = await scanFolder(root);
    expect(found).toHaveLength(1);
    expect(found[0].systemId).toBe('xbox');
    expect(found[0].path).toBe(game);
  });

  it('recognizes an Xbox 360 GOD/STFS install folder', async () => {
    const root = await tempDir();
    const title = path.join(root, '4D530AA4', '00007000');
    const header = path.join(title, '99B5F58BC37BA43E6271');
    await mkdir(path.join(title, '99B5F58BC37BA43E6271.data'), { recursive: true });
    await writeFile(header, Buffer.concat([Buffer.from('LIVE'), Buffer.alloc(64)]));
    await writeFile(path.join(title, '99B5F58BC37BA43E6271.data', 'Data0000'), 'data');

    const found = await scanFolder(root);
    expect(found).toHaveLength(1);
    expect(found[0].systemId).toBe('xbox360');
    expect(found[0].path).toBe(header);
  });
});
