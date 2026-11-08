import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyRpcs3Controls, readRpcs3Controls } from '../src/main/controls/rpcs3';
import { DEFAULT_KEYBOARD } from '../src/main/controls/keymap';

describe('RPCS3 adapter', () => {
  it('writes Player 1 keyboard bindings and forces windowed mode', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-rpcs3-'));
    try {
      await mkdir(path.join(dir, 'config', 'input_configs', 'global'), { recursive: true });
      await writeFile(
        path.join(dir, 'config', 'config.yml'),
        'Input/Output:\n  Keyboard: "Null"\nMiscellaneous:\n  Start games in fullscreen mode: true\n',
      );

      const result = applyRpcs3Controls(dir, { ...DEFAULT_KEYBOARD.rpcs3 }, true);
      expect(result.applied).toBe(true);

      const yaml = await readFile(
        path.join(dir, 'config', 'input_configs', 'global', 'Default.yml'),
        'utf8',
      );
      expect(yaml).toContain('Handler: Keyboard');
      expect(yaml).toContain('Cross: J');
      expect(yaml).toContain('Start: Return');
      expect(yaml).toContain('Select: Backspace');
      // Direction keys also drive the left stick so 3D titles can move.
      expect(yaml).toContain('Left Stick Up: Up');
      expect(yaml).toContain('Left Stick Down: Down');
      expect(yaml).toContain('Left Stick Left: Left');
      expect(yaml).toContain('Left Stick Right: Right');

      const cfg = await readFile(path.join(dir, 'config', 'config.yml'), 'utf8');
      expect(cfg).toContain('Keyboard: "Null"');
      expect(cfg).toContain('Start games in fullscreen mode: false');

      expect(readRpcs3Controls(dir)).toMatchObject({
        a: 'KeyJ',
        b: 'KeyK',
        up: 'ArrowUp',
        start: 'Enter',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
