import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyXeniaControls, readXeniaControls } from '../src/main/controls/xenia';
import { DEFAULT_KEYBOARD } from '../src/main/controls/keymap';

describe('Xenia adapter', () => {
  it('writes and reads [HID.Key] virtual-key bindings', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-xenia-'));
    try {
      const file = path.join(dir, 'xenia-canary.config.toml');
      await writeFile(file, '[HID.Key]\nkeybind_a = "0xBA"\n');
      const result = applyXeniaControls(dir, { ...DEFAULT_KEYBOARD.xenia }, true);
      expect(result.applied).toBe(true);

      const text = await readFile(file, 'utf8');
      expect(text).toContain('keybind_a = "0x4A"');
      expect(text).toContain('keybind_dpad_up = "0x26"');
      expect(text).toContain('keybind_start = "0x0D"');

      expect(readXeniaControls(dir)).toMatchObject({
        a: 'KeyJ',
        b: 'KeyK',
        up: 'ArrowUp',
        start: 'Enter',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('creates a minimal config when the engine has not run yet', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-xenia-'));
    try {
      const result = applyXeniaControls(dir, { ...DEFAULT_KEYBOARD.xenia }, false);
      expect(result.applied).toBe(true);
      expect(readXeniaControls(dir)?.a).toBe('KeyJ');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
