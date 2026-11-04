import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyPpssppControls,
  codeToNkcode,
  nkcodeToCode,
  readPpssppControls,
} from '../src/main/controls/ppsspp';
import { DEFAULT_KEYBOARD } from '../src/main/controls/keymap';

describe('PPSSPP adapter', () => {
  it('maps codes to PPSSPP key codes', () => {
    expect(codeToNkcode('KeyA')).toBe(29);
    expect(codeToNkcode('KeyZ')).toBe(54);
    expect(codeToNkcode('Digit1')).toBe(8);
    expect(codeToNkcode('ArrowUp')).toBe(19);
    expect(codeToNkcode('Enter')).toBe(66);
    expect(nkcodeToCode(38)).toBe('KeyJ');
    expect(nkcodeToCode(19)).toBe('ArrowUp');
  });

  it('writes and reads [ControlMapping] keyboard bindings', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nest-ppsspp-'));
    try {
      const sys = path.join(dir, 'memstick', 'PSP', 'SYSTEM');
      await mkdir(sys, { recursive: true });
      await writeFile(
        path.join(sys, 'controls.ini'),
        '[ControlMapping]\nUp = 1-19,20-19\nCross = 1-54\n',
      );
      const result = applyPpssppControls(dir, { ...DEFAULT_KEYBOARD.ppsspp }, true);
      expect(result.applied).toBe(true);

      const text = await readFile(path.join(sys, 'controls.ini'), 'utf8');
      expect(text).toContain('Cross = 1-38');
      expect(text).toContain('Circle = 1-39');
      expect(text).toContain('Up = 1-19');
      expect(text).toContain('Start = 1-66');

      expect(readPpssppControls(dir)).toMatchObject({
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
