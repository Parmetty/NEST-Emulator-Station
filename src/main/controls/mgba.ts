/**
 * mGBA keyboard adapter.
 *
 * mGBA runs in portable mode (`portable.ini` next to the exe), so its live
 * config is `config.ini` in the engine folder. Keyboard bindings live in
 * `[gba.input.QT_K]` as Qt key integers (`keyA=88` is X). Gamepad bindings in
 * `[gba.input.SDLB]` are seeded once too, because mGBA's stock layout leaves the
 * face buttons unbound.
 */
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { codeToQtKey, qtToCode } from './keymap';
import {
  backupOnce,
  detectEol,
  readMarker,
  readTextFile,
  setSectionEntries,
  splitLines,
  writeMarker,
  writeTextFile,
  type ApplyResult,
} from './util';

const SECTION_KEYBOARD = '[gba.input.QT_K]';
const SECTION_PAD = '[gba.input.SDLB]';

/** PadAction → mGBA ini key. */
const MGBA_KEYS: Array<[PadAction, string]> = [
  ['up', 'keyUp'],
  ['down', 'keyDown'],
  ['left', 'keyLeft'],
  ['right', 'keyRight'],
  ['a', 'keyA'],
  ['b', 'keyB'],
  ['l', 'keyL'],
  ['r', 'keyR'],
  ['start', 'keyStart'],
  ['select', 'keySelect'],
];

/** SDL button indexes for a physical gamepad; written only over stock (-1)s. */
const MGBA_PAD_KEYS: Array<[string, number]> = [
  ['keyA', 0],
  ['keyB', 1],
  ['keyL', 9],
  ['keyR', 10],
  ['keyStart', 6],
  ['keySelect', 4],
];

/** mGBA's stock QT layout is A=X / B=Z. */
function looksStock(text: string): boolean {
  return text.length === 0 || (text.includes('keyA=88') && text.includes('keyB=90'));
}

/** Our own previously written seed. */
function looksSeeded(text: string): boolean {
  return text.includes('keyA=32') && text.includes('keyB=74');
}

export function applyMgbaControls(
  engineDir: string,
  bindings: KeyboardBindings,
  force: boolean,
): ApplyResult {
  const file = path.join(engineDir, 'config.ini');
  const marker = path.join(engineDir, '.nest-controls-v1');
  const text = readTextFile(file);

  if (!force && !looksStock(text) && !looksSeeded(text)) {
    if (!readMarker(marker)) writeMarker(marker, 'kept-user-config');
    return { applied: false, files: [], reason: 'custom' };
  }

  backupOnce(file);
  const eol = detectEol(text);
  const lines = splitLines(text);

  const keyboardEntries: Array<[string, string]> = [];
  for (const [action, keyName] of MGBA_KEYS) {
    const binding = bindings[action];
    if (!binding) continue;
    const qtKey = codeToQtKey(binding);
    if (qtKey == null) continue;
    keyboardEntries.push([keyName, String(qtKey)]);
  }
  setSectionEntries(lines, SECTION_KEYBOARD, keyboardEntries, (key, value) => `${key}=${value}`);

  // Only fill the pad buttons when the file still has mGBA's empty defaults;
  // a player who configured a real pad keeps their mapping.
  if (text.includes('keyA=-1')) {
    setSectionEntries(
      lines,
      SECTION_PAD,
      MGBA_PAD_KEYS.map(([key, value]) => [key, String(value)] as [string, string]),
      (key, value) => `${key}=${value}`,
    );
  }

  writeTextFile(file, lines.join(eol));
  writeMarker(marker, 'applied-v1');
  return { applied: true, files: [file] };
}

/** Read back the Qt keyboard section as canonical `KeyboardEvent.code`s. */
export function readMgbaControls(engineDir: string): KeyboardBindings {
  const text = readTextFile(path.join(engineDir, 'config.ini'));
  const result: KeyboardBindings = {};
  let section = '';
  for (const line of splitLines(text)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      section = trimmed;
      continue;
    }
    if (section !== SECTION_KEYBOARD) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const keyName = trimmed.slice(0, eq);
    const value = Number(trimmed.slice(eq + 1));
    if (!Number.isFinite(value) || value < 0) continue;
    const hit = MGBA_KEYS.find(([, name]) => name === keyName);
    if (!hit) continue;
    const code = qtToCode(value);
    if (code) result[hit[0]] = code;
  }
  return result;
}
