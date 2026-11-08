/**
 * Xenia Canary keyboard adapter.
 *
 * Xenia stores keyboard bindings in `xenia-canary.config.toml` under
 * `[HID.Key]` as Windows virtual-key values, e.g. `keybind_a = "0x4A"`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { backupOnce, findSection, readTextFile, setSectionEntries, splitLines, writeTextFile } from './util';
import { codeToVk, vkToCode } from './keymap';

const FILE = 'xenia-canary.config.toml';

const BUTTONS: Array<[PadAction, string]> = [
  ['up', 'keybind_dpad_up'],
  ['down', 'keybind_dpad_down'],
  ['left', 'keybind_dpad_left'],
  ['right', 'keybind_dpad_right'],
  ['a', 'keybind_a'],
  ['b', 'keybind_b'],
  ['x', 'keybind_x'],
  ['y', 'keybind_y'],
  ['start', 'keybind_start'],
  ['select', 'keybind_back'],
  ['l', 'keybind_left_shoulder'],
  ['r', 'keybind_right_shoulder'],
];

/**
 * Xbox 360 3D titles (racing, shooters) steer with the left stick, not the
 * D-Pad: bind the four directions to both so one panel entry drives menus and
 * gameplay. Stick entries are write-only; the panel keeps reading the D-Pad.
 */
const STICKS: Array<[PadAction, string]> = [
  ['up', 'keybind_left_thumb_up'],
  ['down', 'keybind_left_thumb_down'],
  ['left', 'keybind_left_thumb_left'],
  ['right', 'keybind_left_thumb_right'],
];

function configFile(engineDir: string): string {
  return path.join(engineDir, FILE);
}

function parseValue(raw: string): number | null {
  const value = raw.trim().replace(/^"|"$/g, '').split(/\s+/)[0] ?? '';
  if (!value) return null;
  if (/^0x[0-9a-f]+$/i.test(value)) return Number.parseInt(value, 16);
  if (value.length === 1) return value.toUpperCase().charCodeAt(0);
  return null;
}

export function applyXeniaControls(
  engineDir: string,
  bindings: KeyboardBindings,
  _force: boolean,
): { applied: boolean; files: string[]; reason?: 'custom' | 'unsupported' } {
  const file = configFile(engineDir);
  if (!existsSync(file)) {
    mkdirSync(engineDir, { recursive: true });
    writeFileSync(file, '[HID.Key]\n', 'utf8');
  }
  backupOnce(file);
  const lines = splitLines(readTextFile(file));
  if (!findSection(lines, '[HID.Key]')) lines.push('', '[HID.Key]');
  const entries: Array<[string, string]> = [];
  for (const [action, key] of BUTTONS) {
    const code = bindings[action];
    if (!code) continue;
    const vk = codeToVk(code);
    if (vk === null) continue;
    entries.push([key, `0x${vk.toString(16).toUpperCase().padStart(2, '0')}`]);
  }
  for (const [action, key] of STICKS) {
    const code = bindings[action];
    if (!code) continue;
    const vk = codeToVk(code);
    if (vk === null) continue;
    entries.push([key, `0x${vk.toString(16).toUpperCase().padStart(2, '0')}`]);
  }
  setSectionEntries(lines, '[HID.Key]', entries, (key, value) => `${key} = "${value}"`);
  // Xenia ignores [HID.Key] entirely while keyboard input is disabled
  // (keyboard_mode = 0): every binding parses cleanly but never reaches the
  // guest. Force it on so the panel actually changes behaviour in-game.
  setSectionEntries(
    lines,
    '[HID]',
    [
      ['keyboard_mode', '1'],
      ['keyboard_user_index', '0'],
    ],
    (key, value) => `${key} = ${value}`,
  );
  writeTextFile(file, lines.join('\n'));
  return { applied: true, files: [file] };
}

export function readXeniaControls(engineDir: string): KeyboardBindings | null {
  const text = readTextFile(configFile(engineDir));
  if (!text) return null;
  const lines = splitLines(text);
  const bounds = findSection(lines, '[HID.Key]');
  if (!bounds) return null;
  const map = new Map<string, number>();
  for (let i = bounds.start + 1; i < bounds.end; i += 1) {
    const line = lines[i].trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const parsed = parseValue(line.slice(eq + 1));
    if (parsed !== null) map.set(line.slice(0, eq).trim(), parsed);
  }
  const bindings: KeyboardBindings = {};
  for (const [action, key] of BUTTONS) {
    const value = map.get(key);
    if (value === undefined) continue;
    const code = vkToCode(value);
    if (code) bindings[action] = code;
  }
  return bindings;
}
