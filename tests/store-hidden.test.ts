import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/main/store';

async function tempStore(): Promise<{ store: Store; dir: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-store-'));
  const store = new Store(path.join(dir, 'library.json'));
  await store.load();
  return { store, dir };
}

const rom = {
  path: 'C:/roms/Pokemon.gba',
  fileName: 'Pokemon.gba',
  size: 1024,
  sha1: 'a'.repeat(40),
  systemId: 'gba',
  title: 'Pokemon',
};

describe('removed games stay removed', () => {
  it('does not re-add a removed game on the next scan', async () => {
    const { store, dir } = await tempStore();
    expect((await store.upsertGames([rom])).added).toBe(1);
    const id = store.games('gba')[0].id;
    await store.removeGame(id);
    expect(store.games('gba')).toHaveLength(0);
    expect(store.hiddenGames()).toHaveLength(1);

    const again = await store.upsertGames([rom]);
    expect(again.added).toBe(0);
    expect(store.games('gba')).toHaveLength(0);

    // "全部恢复" clears the list, so the next scan brings it back.
    expect(await store.clearHidden()).toBe(1);
    expect((await store.upsertGames([rom])).added).toBe(1);
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps one record when a big file switches to the fast fingerprint', async () => {
    const { store, dir } = await tempStore();
    await store.upsertGames([rom]);
    const before = store.games('gba')[0];
    const rescan = await store.upsertGames([{ ...rom, sha1: 'b'.repeat(40), size: 2048 }]);
    expect(rescan.added).toBe(0);
    const games = store.games('gba');
    expect(games).toHaveLength(1);
    expect(games[0].id).toBe(before.id);
    expect(games[0].sha1).toBe('b'.repeat(40));
    expect(games[0].size).toBe(2048);
    await rm(dir, { recursive: true, force: true });
  });

  it('persists the hidden list across reloads', async () => {
    const { store, dir } = await tempStore();
    await store.upsertGames([rom]);
    await store.removeGame(store.games('gba')[0].id);
    const reloaded = new Store(path.join(dir, 'library.json'));
    await reloaded.load();
    expect(reloaded.hiddenGames()).toHaveLength(1);
    expect((await reloaded.upsertGames([rom])).added).toBe(0);
    await rm(dir, { recursive: true, force: true });
  });
});
