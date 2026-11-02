import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  cheatExtraArgs,
  cheatSidecarPath,
  managedCheatPath,
  normalizeCheatText,
  readCheatFile,
  saveCheatText,
} from '../src/main/cheats';

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('GBA cheat files', () => {
  it('writes the sidecar mGBA auto-loads', () => {
    expect(cheatSidecarPath('D:\\roms\\Pokemon.gba')).toBe('D:\\roms\\Pokemon.cheats');
    expect(cheatSidecarPath(path.join('root', 'games', 'pokemon.GBA'))).toBe(
      path.join('root', 'games', 'pokemon.cheats'),
    );
  });

  it('normalizes line endings and trailing whitespace', () => {
    expect(normalizeCheatText('02025BC4:000F423F\r\n# note   \r\n\r\n')).toBe(
      '02025BC4:000F423F\n# note\n',
    );
    expect(normalizeCheatText('   \r\n\r\n')).toBe('');
    expect(normalizeCheatText('02025BC4:000F423F')).toBe('02025BC4:000F423F\n');
  });

  it('saves into the ROM folder when it is writable', async () => {
    const dir = await tempDir('nest-cheat-');
    try {
      const rom = path.join(dir, 'Pokemon.gba');
      await writeFile(rom, 'rom');
      const saved = saveCheatText(rom, dir, '02025BC4:000F423F\r\n');
      expect(saved.ok).toBe(true);
      expect(saved.managed).toBe(false);
      expect(saved.path).toBe(path.join(dir, 'Pokemon.cheats'));
      expect(await readFile(saved.path, 'utf8')).toBe('02025BC4:000F423F\n');

      const view = readCheatFile(rom, dir);
      expect(view).toMatchObject({ managed: false, exists: true });
      expect(view.text).toBe('02025BC4:000F423F\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falls back to a managed file when the ROM folder is not writable', async () => {
    const userData = await tempDir('nest-cheat-user-');
    try {
      // The parent folder does not exist -> the sidecar write must fail.
      const rom = path.join(userData, 'missing-folder', 'Pokemon.gba');
      const saved = saveCheatText(rom, userData, '02025BC4:000F423F');
      expect(saved.ok).toBe(true);
      expect(saved.managed).toBe(true);
      expect(saved.path).toBe(managedCheatPath(userData, rom));
      expect(existsSync(saved.path)).toBe(true);

      const view = readCheatFile(rom, userData);
      expect(view).toMatchObject({ managed: true, exists: true });

      expect(cheatExtraArgs('mgba', 'game', rom, userData)).toEqual(['-c', saved.path]);
      expect(cheatExtraArgs('mgba', 'system', rom, userData)).toEqual([]);
      expect(cheatExtraArgs('dolphin', 'game', rom, userData)).toEqual([]);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
  });

  it('prefers the sidecar over a stale managed copy', async () => {
    const dir = await tempDir('nest-cheat-');
    try {
      const rom = path.join(dir, 'Pokemon.gba');
      await writeFile(rom, 'rom');
      const managed = managedCheatPath(dir, rom);
      mkdirSync(path.dirname(managed), { recursive: true });
      await writeFile(managed, '01010101:0000\n');
      await writeFile(cheatSidecarPath(rom), '02025BC4:000F423F\n');

      const view = readCheatFile(rom, dir);
      expect(view.managed).toBe(false);
      expect(view.text).toContain('02025BC4');
      expect(cheatExtraArgs('mgba', 'game', rom, dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects oversized pastes', async () => {
    const dir = await tempDir('nest-cheat-');
    try {
      const saved = saveCheatText(path.join(dir, 'Pokemon.gba'), dir, 'x'.repeat(70 * 1024));
      expect(saved.ok).toBe(false);
      expect(saved.error).toBe('too-large');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
