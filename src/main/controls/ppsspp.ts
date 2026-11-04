/**
 * PPSSPP keyboard adapter.
 *
 * PPSSPP stores keyboard bindings in `memstick/PSP/SYSTEM/controls.ini` as
 * `Button = 1-<code>` where `<code>` is PPSSPP's portable key code (Android
 * NKCODE values): A=29..Z=54, 0=7..9=16, D-pad Up=19..Right=22, Enter=66,
 * Backspace=67, Escape=111.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { backupOnce, findSection, readTextFile, setSectionEntries, splitLines, writeTextFile } from './util';

const FILE = path.join('memstick', 'PSP', 'SYSTEM', 'controls.ini');

const BUTTONS: Array<[PadAction, string]> = [
  ['up', 'Up'],
  ['down', 'Down'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['a', 'Cross'],
  ['b', 'Circle'],
  ['x', 'Square'],
  ['y', 'Triangle'],
  ['start', 'Start'],
  ['select', 'Select'],
  ['l', 'L'],
  ['r', 'R'],
];

const NAMED: Record<string, number> = {
  Enter: 66,
  Escape: 111,
  Backspace: 67,
  Tab: 61,
  Space: 62,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  ShiftLeft: 59,
  ShiftRight: 60,
  ControlLeft: 113,
  ControlRight: 114,
  AltLeft: 57,
  AltRight: 58,
};

/** KeyboardEvent.code → PPSSPP NKCODE. */
export function codeToNkcode(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) return 29 + (code.charCodeAt(3) - 65);
  if (/^Digit[0-9]$/.test(code)) return 7 + Number(code.slice(5));
  if (/^F([1-9]|1[0-2])$/.test(code)) return 131 + Number(code.slice(1)) - 1;
  return NAMED[code] ?? null;
}

export function nkcodeToCode(value: number): string | null {
  if (value >= 29 && value <= 54) return `Key${String.fromCharCode(65 + value - 29)}`;
  if (value >= 7 && value <= 16) return `Digit${value - 7}`;
  if (value >= 131 && value <= 142) return `F${value - 130}`;
  for (const [code, mapped] of Object.entries(NAMED)) {
    if (mapped === value) return code;
  }
  return null;
}

function iniFile(engineDir: string): string {
  return path.join(engineDir, FILE);
}

export function applyPpssppControls(
  engineDir: string,
  bindings: KeyboardBindings,
  _force: boolean,
): { applied: boolean; files: string[]; reason?: 'custom' | 'unsupported' } {
  const file = iniFile(engineDir);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '[ControlMapping]\n');
  }
  backupOnce(file);
  const lines = splitLines(readTextFile(file));
  if (!findSection(lines, '[ControlMapping]')) lines.push('', '[ControlMapping]');
  const entries: Array<[string, string]> = [];
  for (const [action, button] of BUTTONS) {
    const code = bindings[action];
    if (!code) continue;
    const nkcode = codeToNkcode(code);
    if (nkcode === null) continue;
    entries.push([button, `1-${nkcode}`]);
  }
  setSectionEntries(lines, '[ControlMapping]', entries, (key, value) => `${key} = ${value}`);
  writeTextFile(file, lines.join('\n'));
  return { applied: true, files: [file] };
}

export function readPpssppControls(engineDir: string): KeyboardBindings | null {
  const text = readTextFile(iniFile(engineDir));
  if (!text) return null;
  const lines = splitLines(text);
  const bounds = findSection(lines, '[ControlMapping]');
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
    if (!value) continue;
    const token = value.split(',').find((part) => part.trim().startsWith('1-'));
    if (!token) continue;
    const nkcode = Number(token.trim().slice(2));
    const code = nkcodeToCode(nkcode);
    if (code) bindings[action] = code;
  }
  return bindings;
}
