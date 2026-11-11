import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  defaultXboxIsoPath,
  isXboxFolder,
  packXboxFolder,
  prepareXboxRom,
  xboxRomLinkDir,
} from '../src/main/xbox-iso';

async function tempDir(prefix = 'nest-xbox-'): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('xbox disc packaging helpers', () => {
  it('detects an unpacked folder with default.xbe', async () => {
    const dir = await tempDir();
    expect(isXboxFolder(dir)).toBe(false);
    await writeFile(path.join(dir, 'default.xbe'), 'xbe');
    expect(isXboxFolder(dir)).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('defaults the image to a sibling file named after the game folder', () => {
    const folder = path.join('D:\\Games', 'Halo 2 (USA)(Zh)');
    expect(defaultXboxIsoPath(folder)).toBe(path.join('D:\\Games', 'Halo 2 (USA)(Zh).iso'));
  });

  it('refuses to boot a folder when packing is not allowed', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'default.xbe'), 'xbe');
    const result = await prepareXboxRom(dir, dir, 'game', dir, false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('xbox-needs-iso');
    await rm(dir, { recursive: true, force: true });
  });

  it('passes a space-free ISO path through untouched', async () => {
    const dir = await tempDir();
    const iso = path.join(dir, 'game.iso');
    await writeFile(iso, 'iso');
    const result = await prepareXboxRom(dir, dir, 'game', iso);
    expect(result.ok).toBe(true);
    expect(result.rom).toBe(iso);
    await rm(dir, { recursive: true, force: true });
  });

  it('hard-links an ISO whose path has spaces to a space-free name', async () => {
    const userData = await tempDir('nest-userdata-');
    const dir = await tempDir('nest- roms-');
    const iso = path.join(dir, 'Halo 2 (USA).iso');
    await writeFile(iso, 'iso-bytes');
    const result = await prepareXboxRom(userData, dir, 'halo2', iso);
    expect(result.ok).toBe(true);
    expect(result.rom).toBeDefined();
    expect(result.rom!.includes(' ')).toBe(false);
    expect(existsSync(result.rom!)).toBe(true);
    expect((await stat(result.rom!)).size).toBe(9);
    expect(result.rom!.startsWith(xboxRomLinkDir(userData))).toBe(true);
    await rm(userData, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  });

  it('reports a missing extract-xiso helper instead of throwing', async () => {
    const dir = await tempDir();
    await mkdir(path.join(dir, 'game'), { recursive: true });
    await writeFile(path.join(dir, 'game', 'default.xbe'), 'xbe');
    const result = await packXboxFolder(dir, path.join(dir, 'game'), path.join(dir, 'out.iso'));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing-tool');
    await rm(dir, { recursive: true, force: true });
  });
});
