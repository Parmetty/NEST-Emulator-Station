/**
 * ares keyboard adapter (FC / SFC / N64).
 *
 * ares stores controller bindings in BML (an indentation-based ini):
 *
 *   Famicom
 *     Input
 *       Controller.Port.1
 *         Gamepad
 *           Up: 0x1/0/57;;
 *
 * The assignment is `0x<deviceID>/<groupID>/<inputID(hex)>;;`; for the keyboard
 * ares itself writes device `0x1`, group `0`, and Windows virtual-key codes as
 * the inputID (W = 0x57, Enter = 0x0D, ShiftRight = 0xA1). The trailing `;;` is
 * part of the value — it is what ares writes, and omitting it is unverified.
 * See docs/KEYS-ARES.md for the full table and the device-id caveat.
 */
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { aresAssignmentToCode, codeToAresAssignment, DEFAULT_KEYBOARD } from './keymap';
import {
  backupOnce,
  detectEol,
  readMarker,
  readTextFile,
  splitLines,
  writeMarker,
  writeTextFile,
  type ApplyResult,
} from './util';

/** N64's Z trigger has no PadAction; it keeps a fixed key so N64 games with Z work. */
export const ARES_N64_Z = 'Space';

type AresTarget = PadAction | 'z';

interface SystemKeys {
  system: string;
  keys: Array<[AresTarget, string]>;
}

const FC_KEYS: Array<[AresTarget, string]> = [
  ['up', 'Up'],
  ['down', 'Down'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['b', 'B'],
  ['a', 'A'],
  ['select', 'Select'],
  ['start', 'Start'],
];

const ARES_SYSTEMS: SystemKeys[] = [
  { system: 'Famicom', keys: FC_KEYS },
  { system: 'FamicomDiskSystem', keys: FC_KEYS },
  // SFC adds Y/X/L/R; the N64 section has no Select and uses Z instead.
  { system: 'SuperFamicom', keys: [...FC_KEYS, ['y', 'Y'], ['x', 'X'], ['l', 'L'], ['r', 'R']] },
  {
    system: 'Nintendo64',
    keys: [
      ['up', 'Up'],
      ['down', 'Down'],
      ['left', 'Left'],
      ['right', 'Right'],
      ['b', 'B'],
      ['a', 'A'],
      ['start', 'Start'],
      ['l', 'L'],
      ['r', 'R'],
      ['z', 'Z'],
    ],
  },
];

/* ----------------------------------------------------------- BML navigation */
function indentOf(line: string): number {
  let count = 0;
  while (line.charAt(count) === ' ') count += 1;
  return count;
}

function findAtIndent(lines: string[], from: number, to: number, indent: number, text: string): number {
  for (let i = from; i < to; i += 1) {
    if (indentOf(lines[i]) === indent && lines[i].trim() === text) return i;
  }
  return -1;
}

interface BlockRange {
  /** First entry line (8 spaces). */
  start: number;
  /** First line after the Gamepad entries (6 spaces or less). */
  end: number;
}

/** Locate `<system> → Input → Controller.Port.1 → Gamepad` and its entries. */
function findGamepadBlock(lines: string[], system: string): BlockRange | null {
  const systemIndex = lines.findIndex((line) => line === system);
  if (systemIndex < 0) return null;

  let blockEnd = lines.length;
  for (let i = systemIndex + 1; i < lines.length; i += 1) {
    if (lines[i].trim().length > 0 && indentOf(lines[i]) === 0) {
      blockEnd = i;
      break;
    }
  }

  const inputIndex = findAtIndent(lines, systemIndex + 1, blockEnd, 2, 'Input');
  if (inputIndex < 0) return null;
  const portIndex = findAtIndent(lines, inputIndex + 1, blockEnd, 4, 'Controller.Port.1');
  if (portIndex < 0) return null;
  const gamepadIndex = findAtIndent(lines, portIndex + 1, blockEnd, 6, 'Gamepad');
  if (gamepadIndex < 0) return null;

  let end = gamepadIndex + 1;
  while (end < blockEnd && lines[end].trim().length > 0 && indentOf(lines[end]) >= 8) end += 1;
  return { start: gamepadIndex + 1, end };
}

function splitEntry(line: string): { key: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  return { key: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
}

/* ------------------------------------------------------------ assignments */
function bindingFor(action: AresTarget, bindings: KeyboardBindings): string {
  const code = action === 'z' ? ARES_N64_Z : (bindings[action] ?? DEFAULT_KEYBOARD.ares[action]);
  if (!code) return ';;';
  return codeToAresAssignment(code) ?? ';;';
}

function hasCustomBindings(lines: string[], bindings: KeyboardBindings): boolean {
  for (const { system, keys } of ARES_SYSTEMS) {
    const block = findGamepadBlock(lines, system);
    if (!block) continue;
    for (let i = block.start; i < block.end; i += 1) {
      const entry = splitEntry(lines[i]);
      if (!entry) continue;
      const target = keys.find(([, name]) => name === entry.key);
      if (!target) continue;
      const isEmpty = entry.value.length === 0 || entry.value === ';;';
      if (!isEmpty && entry.value !== bindingFor(target[0], bindings)) return true;
    }
  }
  return false;
}

/** Rewrite the target Gamepad entries in place; appends any missing key. */
function rewriteGamepad(lines: string[], system: string, bindings: KeyboardBindings): void {
  const block = findGamepadBlock(lines, system);
  if (!block) return;

  const wanted = new Map<string, string>();
  for (const [action, key] of ARES_SYSTEMS.find((item) => item.system === system)?.keys ?? []) {
    wanted.set(key, bindingFor(action, bindings));
  }

  for (let i = block.start; i < block.end; i += 1) {
    const entry = splitEntry(lines[i]);
    if (!entry) continue;
    const value = wanted.get(entry.key);
    if (value == null) continue;
    lines[i] = `        ${entry.key}: ${value}`;
    wanted.delete(entry.key);
  }

  if (wanted.size > 0) {
    const additions = [...wanted.entries()].map(([key, value]) => `        ${key}: ${value}`);
    lines.splice(block.end, 0, ...additions);
  }
}

/* -------------------------------------------------------------- public API */
export function applyAresControls(
  engineDir: string,
  bindings: KeyboardBindings,
  force: boolean,
): ApplyResult {
  const file = path.join(engineDir, 'settings.bml');
  const marker = path.join(engineDir, '.nest-controls-v1');
  const text = readTextFile(file);
  if (text.length === 0) {
    // Do not fabricate a settings file: ares needs its full tree, and an
    // incomplete BML could make it fall back to defaults (or fail to parse).
    return { applied: false, files: [] };
  }

  const lines = splitLines(text);
  if (!force && hasCustomBindings(lines, bindings)) {
    if (!readMarker(marker)) writeMarker(marker, 'kept-user-config');
    return { applied: false, files: [], reason: 'custom' };
  }

  for (const { system } of ARES_SYSTEMS) rewriteGamepad(lines, system, bindings);
  const output = lines.join(detectEol(text));
  if (output === text) {
    if (!readMarker(marker)) writeMarker(marker, 'applied-v1');
    return { applied: false, files: [] };
  }

  backupOnce(file);
  writeTextFile(file, output);
  writeMarker(marker, 'applied-v1');
  return { applied: true, files: [file] };
}

/** Merge Port 1 Gamepad bindings from FC / SFC / N64 into one action map. */
export function readAresControls(engineDir: string): KeyboardBindings {
  const lines = splitLines(readTextFile(path.join(engineDir, 'settings.bml')));
  const result: KeyboardBindings = {};
  for (const { system, keys } of ARES_SYSTEMS) {
    const block = findGamepadBlock(lines, system);
    if (!block) continue;
    for (let i = block.start; i < block.end; i += 1) {
      const entry = splitEntry(lines[i]);
      if (!entry) continue;
      const target = keys.find(([, name]) => name === entry.key);
      if (!target || target[0] === 'z') continue;
      if (result[target[0]]) continue;
      const code = aresAssignmentToCode(entry.value);
      if (code) result[target[0]] = code;
    }
  }
  return result;
}
