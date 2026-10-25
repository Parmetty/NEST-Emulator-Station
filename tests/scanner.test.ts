import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanFolder, titleFrom } from '../src/main/scanner';
import { Store } from '../src/main/store';

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nest-scan-'));
  await writeFile(path.join(root, 'Golden Sun.gba'), 'gba-bytes');
  await writeFile(path.join(root, 'notes.txt'), 'ignore me');
  await mkdir(path.join(root, 'snes'));
  await writeFile(path.join(root, 'snes', 'Super Mario World (USA) [b1].sfc'), 'sfc-bytes');
  await mkdir(path.join(root, 'empty'));
  return root;
}

describe('scanner', () => {
  it('walks nested folders and keeps known ROM extensions', async () => {
    const root = await fixture();
    const files = await scanFolder(root);
    expect(files.map((f) => f.fileName).sort()).toEqual([
      'Golden Sun.gba',
      'Super Mario World (USA) [b1].sfc',
    ]);
  });

  it('maps extensions to systems and hashes the bytes', async () => {
    const root = await fixture();
    const files = await scanFolder(root);
    const gba = files.find((f) => f.fileName === 'Golden Sun.gba');
    const sfc = files.find((f) => f.systemId === 'sfc');
    expect(gba?.systemId).toBe('gba');
    expect(gba?.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(gba?.size).toBeGreaterThan(0);
    expect(sfc?.title).toBe('Super Mario World');
  });

  it('filters by system', async () => {
    const root = await fixture();
    const files = await scanFolder(root, { systemId: 'sfc' });
    expect(files).toHaveLength(1);
    expect(files[0].systemId).toBe('sfc');
  });

  it('derives readable titles from file names', () => {
    expect(titleFrom('Pokemon - Emerald Version (USA).gba')).toBe('Pokemon - Emerald Version');
    expect(titleFrom('Super_Mario_64_\(USA\).z64')).toBe('Super Mario 64');
    expect(titleFrom('weird.name.v2.gba')).toBe('weird name v2');
  });
});

describe('store games', () => {
  it('dedupes by content hash and keeps the newest files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-store-'));
    const store = new Store(path.join(dir, 'library.json'));
    await store.load();

    const root = await fixture();
    const files = await scanFolder(root);
    const first = await store.upsertGames(files);
    expect(first.added).toBe(2);

    const again = await store.upsertGames(files);
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(2);

    expect(store.gameCount('gba')).toBe(1);
    expect(store.games('gba')[0].title).toBe('Golden Sun');
  });
});
