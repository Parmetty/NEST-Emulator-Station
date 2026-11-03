import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findAzaharHomeMenu } from '../src/main/azahar-home';

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function installHomeMenu(
  root: string,
  systemId: string,
  region: string,
  contentName: string,
  size: number,
): Promise<string> {
  const dir = path.join(root, 'nand', systemId, 'title', '00040030', region, 'content');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, contentName), Buffer.alloc(size));
  return path.join(dir, contentName);
}

describe('Azahar HOME Menu detection', () => {
  it('returns null when no system files are installed', async () => {
    const dir = await tempDir('nest-3ds-');
    try {
      expect(findAzaharHomeMenu(dir)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('finds the HOME Menu NCCH inside the Roaming data directory', async () => {
    const dir = await tempDir('nest-3ds-');
    try {
      const home = path.join(dir, 'AppData', 'Roaming', 'Azahar');
      const expected = await installHomeMenu(
        home,
        '0123456789abcdef0123456789abcdef',
        '00008f02',
        '00000000.app',
        64,
      );
      expect(findAzaharHomeMenu(dir)).toBe(expected);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('picks the largest .app when a title has multiple contents', async () => {
    const dir = await tempDir('nest-3ds-');
    try {
      const home = path.join(dir, 'AppData', 'Roaming', 'Azahar');
      await installHomeMenu(home, '0123456789abcdef0123456789abcdef', '00008f02', '00000000.app', 8);
      const main = await installHomeMenu(
        home,
        '0123456789abcdef0123456789abcdef',
        '00008f02',
        '00000001.app',
        128,
      );
      expect(findAzaharHomeMenu(dir)).toBe(main);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
