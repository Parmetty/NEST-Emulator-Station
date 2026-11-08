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
      // Xenia parses [HID.Key] but ignores it while keyboard input is disabled.
      expect(text).toContain('keyboard_mode = 1');
      expect(text).toContain('keyboard_user_index = 0');
      // Direction keys also drive the left thumb stick (3D titles use it).
      expect(text).toContain('keybind_left_thumb_up = "0x26"');
      expect(text).toContain('keybind_left_thumb_left = "0x25"');

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

  it('enables keyboard input and keeps unrelated [HID] keys', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-xenia-'));
    try {
      const file = path.join(dir, 'xenia-canary.config.toml');
      await writeFile(file, '[HID]\nkeyboard_mode = 0\nvibration = false\n\n[HID.Key]\n');
      applyXeniaControls(dir, { ...DEFAULT_KEYBOARD.xenia }, true);
      const text = await readFile(file, 'utf8');
      expect(text).toContain('keyboard_mode = 1');
      expect(text).toContain('vibration = false');
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
