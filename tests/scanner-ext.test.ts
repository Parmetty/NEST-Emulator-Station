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
    expect(EXT_TO_SYSTEM.dsi).toBe('nds');
    expect(EXT_TO_SYSTEM.ids).toBe('nds');
    expect(EXT_TO_SYSTEM.srl).toBe('nds');
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

  it('scans subfolders and files mixed together', async () => {
    const root = await tempDir();
    const nested = path.join(root, 'roms', 'gba');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nextFile(root), 'x.cia'), 'cia');
    await writeFile(path.join(nested, 'y.gba'), 'gba');

    function nextFile(base: string): string {
      return base;
    }

    const found = await scanFolder(root);
    const bySystem = found.map((file) => file.systemId).sort();
    expect(bySystem).toEqual(['3ds', 'gba']);
  });
});
