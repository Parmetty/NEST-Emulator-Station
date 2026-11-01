import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyCemuControls,
  cemuBindingsToEntries,
  parseCemuProfile,
  readCemuControls,
  renderCemuProfile,
} from '../src/main/controls/cemu';
import { codeToVk, DEFAULT_KEYBOARD, vkToCode } from '../src/main/controls/keymap';

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

const PROFILE = path.join('portable', 'controllerProfiles', 'controller0.xml');
const SETTINGS = path.join('portable', 'settings.xml');

describe('Cemu adapter', () => {
  it('maps KeyboardEvent.code to Windows virtual-key codes', () => {
    expect(codeToVk('KeyA')).toBe(65);
    expect(codeToVk('KeyJ')).toBe(74);
    expect(codeToVk('Space')).toBe(32);
    expect(codeToVk('Enter')).toBe(0x0d);
    expect(codeToVk('ArrowUp')).toBe(0x26);
    expect(codeToVk('F5')).toBe(0x74);
    expect(vkToCode(74)).toBe('KeyJ');
    expect(vkToCode(0x26)).toBe('ArrowUp');
  });

  it('renders a Wii U GamePad keyboard profile', () => {
    const xml = renderCemuProfile(DEFAULT_KEYBOARD.cemu);
    expect(xml).toContain('<type>Wii U GamePad</type>');
    expect(xml).toContain('<api>Keyboard</api>');
    // A = Space, B = J, X = K, Y = L
    expect(xml).toMatch(/<mapping>1<\/mapping>\s*<button>32<\/button>/);
    expect(xml).toMatch(/<mapping>2<\/mapping>\s*<button>74<\/button>/);
    expect(xml).toMatch(/<mapping>3<\/mapping>\s*<button>75<\/button>/);
    expect(xml).toMatch(/<mapping>4<\/mapping>\s*<button>76<\/button>/);
    // Start/Select → Plus/Minus
    expect(xml).toMatch(/<mapping>9<\/mapping>\s*<button>13<\/button>/);
    expect(xml).toMatch(/<mapping>10<\/mapping>\s*<button>8<\/button>/);
    // D-pad and both sticks share the arrow keys
    expect(xml).toMatch(/<mapping>11<\/mapping>\s*<button>38<\/button>/);
    expect(xml).toMatch(/<mapping>17<\/mapping>\s*<button>38<\/button>/);
    expect(xml).toMatch(/<mapping>21<\/mapping>\s*<button>38<\/button>/);
    // ZL/ZR keep '1' / '2' like the reference profile
    expect(xml).toMatch(/<mapping>7<\/mapping>\s*<button>49<\/button>/);
    expect(xml).toMatch(/<mapping>8<\/mapping>\s*<button>50<\/button>/);
  });

  it('round-trips through the parser', () => {
    const parsed = parseCemuProfile(renderCemuProfile(DEFAULT_KEYBOARD.cemu));
    expect(parsed).toMatchObject({ a: 'Space', b: 'KeyJ', start: 'Enter', select: 'Backspace', up: 'ArrowUp' });
  });

  it('seeds a profile and enables controller profiles in settings.xml', async () => {
    const dir = await tempDir('nest-cemu-');
    try {
      await mkdir(path.join(dir, 'portable', 'controllerProfiles'), { recursive: true });
      await writeFile(
        path.join(dir, SETTINGS),
        '<content>\n  <GamePad>\n    <ControllerProfiles>false</ControllerProfiles>\n  </GamePad>\n</content>\n',
      );

      const result = applyCemuControls(dir, { ...DEFAULT_KEYBOARD.cemu }, false);
      expect(result.applied).toBe(true);

      const profile = await readFile(path.join(dir, PROFILE), 'utf8');
      expect(profile).toContain('<type>Wii U GamePad</type>');
      expect(profile).toMatch(/<mapping>1<\/mapping>\s*<button>32<\/button>/);
      expect(readCemuControls(dir)).toMatchObject({ a: 'Space', x: 'KeyK' });

      const settings = await readFile(path.join(dir, SETTINGS), 'utf8');
      expect(settings).toContain('<ControllerProfiles>true</ControllerProfiles>');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps a hand-made profile unless the panel saves (force)', async () => {
    const dir = await tempDir('nest-cemu-');
    try {
      await mkdir(path.join(dir, 'portable', 'controllerProfiles'), { recursive: true });
      const custom = renderCemuProfile({ a: 'KeyA', b: 'KeyB' });
      await writeFile(path.join(dir, PROFILE), custom);

      const kept = applyCemuControls(dir, { ...DEFAULT_KEYBOARD.cemu }, false);
      expect(kept.applied).toBe(false);
      expect(kept.reason).toBe('custom');
      expect(await readFile(path.join(dir, PROFILE), 'utf8')).toBe(custom);

      const forced = applyCemuControls(dir, { ...DEFAULT_KEYBOARD.cemu }, true);
      expect(forced.applied).toBe(true);
      expect(existsSync(path.join(dir, `${PROFILE}.before-nest`))).toBe(true);
      expect(await readFile(path.join(dir, `${PROFILE}.before-nest`), 'utf8')).toBe(custom);
      expect(await readFile(path.join(dir, PROFILE), 'utf8')).toMatch(/<mapping>1<\/mapping>\s*<button>32<\/button>/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exposes the binding id table used by the profile writer', () => {
    const entries = cemuBindingsToEntries(DEFAULT_KEYBOARD.cemu);
    const ids = entries.map(([id]) => id);
    expect(ids).toContain(1);
    expect(ids).toContain(17);
    expect(ids).toContain(21);
    expect(ids).toContain(7);
    expect(entries.find(([id]) => id === 1)?.[1]).toBe(32);
  });
});
