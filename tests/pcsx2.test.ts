import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyPcsx2Controls,
  codeToPcsx2Key,
  pcsx2KeyToCode,
  readPcsx2Controls,
} from '../src/main/controls/pcsx2';
import { DEFAULT_KEYBOARD } from '../src/main/controls/keymap';
import { ensurePcsx2Data, pcsx2BiosFiles } from '../src/main/pcsx2';

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('PCSX2 adapter', () => {
  it('maps codes to PCSX2 keyboard names', () => {
    expect(codeToPcsx2Key('KeyJ')).toBe('J');
    expect(codeToPcsx2Key('Digit1')).toBe('1');
    expect(codeToPcsx2Key('Enter')).toBe('Return');
    expect(codeToPcsx2Key('ArrowUp')).toBe('Up');
    expect(pcsx2KeyToCode('J')).toBe('KeyJ');
    expect(pcsx2KeyToCode('Return')).toBe('Enter');
  });

  it('writes and reads the [Pad1] keyboard layout', async () => {
    const dir = await tempDir('nest-pcsx2-');
    try {
      await mkdir(path.join(dir, 'inis'), { recursive: true });
      await writeFile(
        path.join(dir, 'inis', 'PCSX2.ini'),
        '[UI]\nSettingsVersion = 1\n\n[Pad1]\nType = DualShock2\nCross = Keyboard/X\n',
      );
      const result = applyPcsx2Controls(dir, { ...DEFAULT_KEYBOARD.pcsx2 }, true);
      expect(result.applied).toBe(true);

      const text = await readFile(path.join(dir, 'inis', 'PCSX2.ini'), 'utf8');
      expect(text).toContain('Cross = Keyboard/J');
      expect(text).toContain('Circle = Keyboard/K');
      expect(text).toContain('Up = Keyboard/Up');
      expect(text).toContain('Start = Keyboard/Return');

      expect(readPcsx2Controls(dir)).toMatchObject({
        a: 'KeyJ',
        b: 'KeyK',
        start: 'Enter',
        up: 'ArrowUp',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('creates the PCSX2 data skeleton from the seed ini', async () => {
    const userData = await tempDir('nest-pcsx2-user-');
    const seed = await tempDir('nest-pcsx2-seed-');
    try {
      await writeFile(path.join(seed, 'PCSX2.ini'), '[UI]\nSettingsVersion = 1\nSetupWizardIncomplete = false\n');
      const data = ensurePcsx2Data(userData, seed);
      expect(data.ok).toBe(true);
      expect(data.seeded).toBe(true);
      expect(await readFile(data.ini, 'utf8')).toContain('SetupWizardIncomplete = false');
      expect(pcsx2BiosFiles(userData)).toEqual([]);
    } finally {
      await rm(userData, { recursive: true, force: true });
      await rm(seed, { recursive: true, force: true });
    }
  });
});
