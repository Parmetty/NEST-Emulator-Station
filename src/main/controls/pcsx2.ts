/**
 * PCSX2 keyboard adapter.
 *
 * PCSX2 stores controller bindings in `inis/PCSX2.ini` as
 * `Button = Keyboard/<name>` (e.g. `Cross = Keyboard/J`, `Up = Keyboard/Up`).
 * Nest owns the data directory (`<userData>/playstation/PCSX2`), so writing the
 * [Pad1] section is safe; a backup is taken once.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { backupOnce, findSection, readTextFile, setSectionEntries, splitLines, writeTextFile } from './util';

const FILE = path.join('inis', 'PCSX2.ini');

/** PadAction → PCSX2 button name. */
const BUTTONS: Array<[PadAction, string]> = [
  ['up', 'Up'],
  ['right', 'Right'],
  ['down', 'Down'],
  ['left', 'Left'],
  ['y', 'Triangle'],
  ['b', 'Circle'],
  ['a', 'Cross'],
  ['x', 'Square'],
  ['select', 'Select'],
  ['start', 'Start'],
  ['l', 'L1'],
  ['r', 'R1'],
];

const NAMED: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Control',
  ControlRight: 'Control',
  AltLeft: 'Alt',
  AltRight: 'Alt',
};

/** KeyboardEvent.code → the name PCSX2 expects after `Keyboard/`. */
export function codeToPcsx2Key(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

export function pcsx2KeyToCode(name: string): string | null {
  const value = name.trim();
  if (/^[A-Z]$/.test(value)) return `Key${value}`;
  if (/^[0-9]$/.test(value)) return `Digit${value}`;
  if (/^F([1-9]|1[0-2])$/.test(value)) return value;
  for (const [code, mapped] of Object.entries(NAMED)) {
    if (mapped === value) return code;
  }
  return null;
}

function iniFile(configDir: string): string {
  return path.join(configDir, FILE);
}

function pad1Section(lines: string[]): { start: number; end: number } | null {
  return findSection(lines, '[Pad1]');
}

export function applyPcsx2Controls(
  configDir: string,
  bindings: KeyboardBindings,
  _force: boolean,
): { applied: boolean; files: string[]; reason?: 'custom' | 'unsupported' } {
  const file = iniFile(configDir);
  if (!existsSync(file)) return { applied: false, files: [], reason: 'unsupported' };
  backupOnce(file);
  const lines = splitLines(readTextFile(file));
  if (!pad1Section(lines)) {
    lines.push('', '[Pad1]', 'Type = DualShock2');
  }
  const entries: Array<[string, string]> = [['Type', 'DualShock2']];
  for (const [action, button] of BUTTONS) {
    const code = bindings[action];
    if (!code) continue;
    const key = codeToPcsx2Key(code);
    if (!key) continue;
    entries.push([button, `Keyboard/${key}`]);
  }
  setSectionEntries(lines, '[Pad1]', entries, (key, value) => `${key} = ${value}`);
  writeTextFile(file, lines.join('\n'));
  return { applied: true, files: [file] };
}

export function readPcsx2Controls(configDir: string): KeyboardBindings | null {
  const text = readTextFile(iniFile(configDir));
  if (!text) return null;
  const lines = splitLines(text);
  const bounds = pad1Section(lines);
  if (!bounds) return null;
  const map = new Map<string, string>();
  for (let i = bounds.start + 1; i < bounds.end; i += 1) {
    const line = lines[i].trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  const bindings: KeyboardBindings = {};
  for (const [action, button] of BUTTONS) {
    const value = map.get(button);
    if (!value || !value.startsWith('Keyboard/')) continue;
    const code = pcsx2KeyToCode(value.slice('Keyboard/'.length));
    if (code) bindings[action] = code;
  }
  return bindings;
}
