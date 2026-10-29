/**
 * Dolphin keyboard adapter.
 *
 * Dolphin keeps controller bindings in `<userData>/dolphin/Config/GCPadNew.ini`.
 * Keyboard keys are DirectInput names wrapped in backticks (`Buttons/A = `SPACE``).
 * Nest maps the pad actions onto the GameCube controller the same way the
 * original seed did: A/B/X/Y + Start on the face buttons, L/R on the analog
 * triggers, the left main stick on WASD. The C-Stick, Z and d-pad keep their
 * historical fixed values because `PadAction` has no actions for them.
 */
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { codeToDolphinName, DEFAULT_KEYBOARD, dolphinNameToCode } from './keymap';
import {
  backupOnce,
  readMarker,
  readTextFile,
  splitLines,
  writeMarker,
  writeTextFile,
  type ApplyResult,
} from './util';

const HEADER = '[GCPad1]';

/** PadAction → GCPadNew.ini button path. */
const DOLPHIN_KEYS: Array<[PadAction, string]> = [
  ['a', 'Buttons/A'],
  ['b', 'Buttons/B'],
  ['x', 'Buttons/X'],
  ['y', 'Buttons/Y'],
  ['start', 'Buttons/Start'],
  ['l', 'Triggers/L'],
  ['r', 'Triggers/R'],
  ['up', 'Main Stick/Up'],
  ['down', 'Main Stick/Down'],
  ['left', 'Main Stick/Left'],
  ['right', 'Main Stick/Right'],
];

/** Dolphin's own default layout: A = `X`, main stick = arrow keys. */
function looksStock(text: string): boolean {
  return text.length === 0 || (text.includes('Buttons/A = `X`') && text.includes('Main Stick/Up = `UP`'));
}

function padLine(key: string, code: string): string | null {
  const name = codeToDolphinName(code);
  return name ? `${key} = \`${name}\`` : null;
}

function bindingLine(action: PadAction, bindings: KeyboardBindings): string | null {
  const hit = DOLPHIN_KEYS.find(([mapped]) => mapped === action);
  if (!hit) return null;
  const binding = bindings[action] ?? DEFAULT_KEYBOARD.dolphin[action];
  return binding ? padLine(hit[1], binding) : null;
}

function compose(bindings: KeyboardBindings): string {
  const lines: Array<string | null> = [
    HEADER,
    'Device = DInput/0/Keyboard Mouse',
    bindingLine('a', bindings),
    bindingLine('b', bindings),
    bindingLine('x', bindings),
    bindingLine('y', bindings),
    'Buttons/Z = `U`',
    bindingLine('start', bindings),
    bindingLine('up', bindings),
    bindingLine('down', bindings),
    bindingLine('left', bindings),
    bindingLine('right', bindings),
    'Main Stick/Calibration = 100.00 141.42 100.00 141.42 100.00 141.42 100.00 141.42',
    'C-Stick/Up = `T`',
    'C-Stick/Down = `G`',
    'C-Stick/Left = `F`',
    'C-Stick/Right = `H`',
    'C-Stick/Calibration = 100.00 141.42 100.00 141.42 100.00 141.42 100.00 141.42',
    bindingLine('l', bindings),
    bindingLine('r', bindings),
    'D-Pad/Up = `UP`',
    'D-Pad/Down = `DOWN`',
    'D-Pad/Left = `LEFT`',
    'D-Pad/Right = `RIGHT`',
    'Triforce/Test = `1`',
    'Triforce/Service = `2`',
    'Triforce/Coin = `3`',
    '[GCPad2]',
    'Device = DInput/0/Keyboard Mouse',
    '[GCPad3]',
    'Device = DInput/0/Keyboard Mouse',
    '[GCPad4]',
    'Device = DInput/0/Keyboard Mouse',
    '',
  ];
  return lines.filter((line): line is string => line !== null).join('\r\n');
}

export function applyDolphinControls(
  configDir: string,
  bindings: KeyboardBindings,
  force: boolean,
): ApplyResult {
  const file = path.join(configDir, 'GCPadNew.ini');
  const marker = path.join(configDir, '.nest-controls-v1');
  const existing = readTextFile(file);

  if (!force && readMarker(marker)) {
    return { applied: false, files: [], reason: 'custom' };
  }
  if (!force && !looksStock(existing)) {
    if (!readMarker(marker)) writeMarker(marker, 'kept-user-config');
    return { applied: false, files: [], reason: 'custom' };
  }

  backupOnce(file);
  writeTextFile(file, compose(bindings));
  writeMarker(marker, 'applied-v1');
  return { applied: true, files: [file] };
}

export function readDolphinControls(configDir: string): KeyboardBindings {
  const text = readTextFile(path.join(configDir, 'GCPadNew.ini'));
  const result: KeyboardBindings = {};
  let section = '';
  for (const line of splitLines(text)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      section = trimmed;
      continue;
    }
    if (section !== HEADER) continue;
    const match = /^([^=]+)=\s*`([^`]+)`/.exec(trimmed);
    if (!match) continue;
    const key = match[1].trim();
    const hit = DOLPHIN_KEYS.find(([, name]) => name === key);
    if (!hit) continue;
    const code = dolphinNameToCode(match[2]);
    if (code) result[hit[0]] = code;
  }
  return result;
}
