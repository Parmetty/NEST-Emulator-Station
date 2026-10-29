/**
 * melonDS keyboard adapter.
 *
 * melonDS 1.1 keeps its settings in `melonDS.toml` next to the executable and
 * stores per-keyboard bindings in `[Instance0.Keyboard]` as Qt key integers,
 * with `-1` meaning "unbound". Nest seeds the same handheld layout as GBA/3DS
 * (Space = A, J = B, K = X, L = Y, Q/E = L/R, Enter/Backspace = Start/Select,
 * arrow keys = d-pad).
 */
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { codeToQtKey, qtToCode } from './keymap';
import {
  backupOnce,
  detectEol,
  findSection,
  readMarker,
  readTextFile,
  setSectionEntries,
  splitLines,
  writeMarker,
  writeTextFile,
  type ApplyResult,
} from './util';

const SECTION = '[Instance0.Keyboard]';

/** PadAction → melonDS TOML key. */
const MELONDS_KEYS: Array<[PadAction, string]> = [
  ['up', 'Up'],
  ['down', 'Down'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['a', 'A'],
  ['b', 'B'],
  ['x', 'X'],
  ['y', 'Y'],
  ['l', 'L'],
  ['r', 'R'],
  ['start', 'Start'],
  ['select', 'Select'],
];

/** Parse `[Instance0.Keyboard]` into UiAction → Qt key int (missing keys omitted). */
function readValues(text: string): Record<string, number> {
  const values: Record<string, number> = {};
  const lines = splitLines(text);
  const bounds = findSection(lines, SECTION);
  if (!bounds) return values;
  for (let i = bounds.start + 1; i < bounds.end; i += 1) {
    const trimmed = lines[i].trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = Number(trimmed.slice(eq + 1).trim());
    if (Number.isFinite(value)) values[key] = value;
  }
  return values;
}

function looksStock(values: Record<string, number>): boolean {
  return MELONDS_KEYS.every(([, key]) => (values[key] ?? -1) === -1);
}

function looksSeeded(values: Record<string, number>, bindings: KeyboardBindings): boolean {
  return MELONDS_KEYS.every(([action, key]) => {
    const expected = bindings[action] ? codeToQtKey(bindings[action]!) : null;
    return expected != null && values[key] === expected;
  });
}

export function applyMelondsControls(
  engineDir: string,
  bindings: KeyboardBindings,
  force: boolean,
): ApplyResult {
  const file = path.join(engineDir, 'melonDS.toml');
  const marker = path.join(engineDir, '.nest-controls-v1');
  const text = readTextFile(file);
  const values = readValues(text);

  if (!force && !looksStock(values) && !looksSeeded(values, bindings)) {
    if (!readMarker(marker)) writeMarker(marker, 'kept-user-config');
    return { applied: false, files: [], reason: 'custom' };
  }

  backupOnce(file);
  const eol = detectEol(text);
  const lines = splitLines(text);

  const entries: Array<[string, string]> = [];
  for (const [action, key] of MELONDS_KEYS) {
    const binding = bindings[action];
    const qtKey = binding ? codeToQtKey(binding) : null;
    entries.push([key, String(qtKey ?? -1)]);
  }
  setSectionEntries(lines, SECTION, entries, (key, value) => `${key} = ${value}`);

  writeTextFile(file, lines.join(eol));
  writeMarker(marker, 'applied-v1');
  return { applied: true, files: [file] };
}

export function readMelondsControls(engineDir: string): KeyboardBindings {
  const values = readValues(readTextFile(path.join(engineDir, 'melonDS.toml')));
  const result: KeyboardBindings = {};
  for (const [action, key] of MELONDS_KEYS) {
    const value = values[key];
    if (value == null || value < 0) continue;
    const code = qtToCode(value);
    if (code) result[action] = code;
  }
  return result;
}
