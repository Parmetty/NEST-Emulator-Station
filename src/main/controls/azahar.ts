/**
 * Azahar (3DS) keyboard adapter.
 *
 * Azahar stores controls in `<userData>/azahar/AppData/Roaming/Azahar/config/qt-config.ini`,
 * one flat key per button under `[Controls]`:
 *   profiles\1\button_a="code:32,engine:keyboard"
 * Values are Qt key codes. Analog sticks are `analog_from_button` maps where
 * `$0` is `:` and `$1` is `,`. Nest also switches between a keyboard layout and
 * a generic SDL gamepad layout depending on whether a pad is plugged in.
 */
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { codeToQtKey, qtToCode } from './keymap';
import {
  backupOnce,
  readMarker,
  readTextFile,
  upsertControl,
  writeMarker,
  writeTextFile,
  type ApplyResult,
} from './util';

/** PadAction → Azahar `profiles\1\button_*` key. */
const KEYBOARD_ACTIONS: Array<[PadAction, string]> = [
  ['a', 'profiles\\1\\button_a'],
  ['b', 'profiles\\1\\button_b'],
  ['x', 'profiles\\1\\button_x'],
  ['y', 'profiles\\1\\button_y'],
  ['l', 'profiles\\1\\button_l'],
  ['r', 'profiles\\1\\button_r'],
  ['start', 'profiles\\1\\button_start'],
  ['select', 'profiles\\1\\button_select'],
  ['up', 'profiles\\1\\button_up'],
  ['down', 'profiles\\1\\button_down'],
  ['left', 'profiles\\1\\button_left'],
  ['right', 'profiles\\1\\button_right'],
];

/** Extra keyboard-only controls (no PadAction equivalent). */
const STATIC_KEYBOARD: Array<[string, string]> = [
  ['profiles\\1\\button_zl', '"code:49,engine:keyboard"'],
  ['profiles\\1\\button_zr', '"code:50,engine:keyboard"'],
  [
    'profiles\\1\\circle_pad',
    '"down:code$083$1engine$0keyboard,engine:analog_from_button,left:code$065$1engine$0keyboard,' +
      'modifier:code$068$1engine$0keyboard,modifier_scale:0.500000,right:code$068$1engine$0keyboard,' +
      'up:code$087$1engine$0keyboard"',
  ],
  [
    'profiles\\1\\c_stick',
    '"down:code$071$1engine$0keyboard,engine:analog_from_button,left:code$070$1engine$0keyboard,' +
      'modifier:code$068$1engine$0keyboard,modifier_scale:0.500000,right:code$072$1engine$0keyboard,' +
      'up:code$084$1engine$0keyboard"',
  ],
];

/** Gamepad layout; `maptype:all` binds whichever SDL pad is attached. */
const GAMEPAD_CONTROLS: Array<[string, string]> = [
  ['profiles\\1\\button_a', '"button:1,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_b', '"button:0,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_x', '"button:3,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_y', '"button:2,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_up', '"button:11,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_down', '"button:12,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_left', '"button:13,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_right', '"button:14,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_l', '"button:9,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_r', '"button:10,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_start', '"button:6,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  ['profiles\\1\\button_select', '"button:4,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  [
    'profiles\\1\\button_zl',
    '"axis:4,engine:sdl,guid:0,port:-1,maptype:all,api:controller,direction:+,threshold:0.5"',
  ],
  [
    'profiles\\1\\button_zr',
    '"axis:5,engine:sdl,guid:0,port:-1,maptype:all,api:controller,direction:+,threshold:0.5"',
  ],
  ['profiles\\1\\button_home', '"button:5,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
  [
    'profiles\\1\\circle_pad',
    '"axis_x:0,axis_y:1,engine:sdl,guid:0,port:-1,maptype:all,api:controller"',
  ],
  ['profiles\\1\\c_stick', '"axis_x:2,axis_y:3,engine:sdl,guid:0,port:-1,maptype:all,api:controller"'],
];

const EMPTY_CONFIG = [
  '[Controls]',
  'profile\\default=true',
  'profile=0',
  'profiles\\1\\name\\default=false',
  'profiles\\1\\name=Default',
  'profiles\\size=1',
  '',
].join('\n');

function azaharDir(root: string): string {
  return path.join(root, 'AppData', 'Roaming', 'Azahar', 'config');
}

function keyboardPairs(bindings: KeyboardBindings): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [action, key] of KEYBOARD_ACTIONS) {
    const binding = bindings[action];
    const qtKey = binding ? codeToQtKey(binding) : null;
    if (qtKey == null) continue;
    pairs.push([key, `"code:${qtKey},engine:keyboard"`]);
  }
  pairs.push(...STATIC_KEYBOARD);
  return pairs;
}

export function applyAzaharControls(
  root: string,
  bindings: KeyboardBindings,
  gamepads: number,
  force: boolean,
  modeOverride?: 'keyboard' | 'gamepad',
): ApplyResult {
  const dir = azaharDir(root);
  const file = path.join(dir, 'qt-config.ini');
  const legacyMarker = path.join(root, '.nest-controls-v1');
  const modeMarker = path.join(root, '.nest-controls-mode');
  const desired = modeOverride ?? (gamepads > 0 ? 'gamepad' : 'keyboard');
  const text = readTextFile(file);

  const hasKeyboardSeed = text.includes('profiles\\1\\button_a="code:32,engine:keyboard"');
  const hasGamepadSeed = text.includes('profiles\\1\\button_a="button:1,engine:sdl');
  const stock = text.length === 0 || text.includes('profiles\\1\\button_a="code:65,engine:keyboard"');

  if (!force && !stock && !hasKeyboardSeed && !hasGamepadSeed) {
    if (!readMarker(legacyMarker)) writeMarker(legacyMarker, 'kept-user-config');
    return { applied: false, files: [], reason: 'custom' };
  }

  if (!force && (desired === 'gamepad' ? hasGamepadSeed : hasKeyboardSeed)) {
    writeMarker(modeMarker, desired);
    return { applied: false, files: [] };
  }

  const pairs = desired === 'gamepad' ? GAMEPAD_CONTROLS : keyboardPairs(bindings);
  backupOnce(file);
  let next = text.length > 0 ? text : EMPTY_CONFIG;
  for (const [key, value] of pairs) {
    next = upsertControl(next, key, value);
    next = upsertControl(next, `${key}\\default`, 'false');
  }

  writeTextFile(file, next);
  writeMarker(legacyMarker, 'applied-v1');
  writeMarker(modeMarker, desired);
  return { applied: true, files: [file] };
}

export function readAzaharControls(root: string): KeyboardBindings {
  const text = readTextFile(path.join(azaharDir(root), 'qt-config.ini'));
  const result: KeyboardBindings = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(profiles\\1\\button_[a-z]+)="code:(\d+),engine:keyboard"/.exec(line.trim());
    if (!match) continue;
    const hit = KEYBOARD_ACTIONS.find(([, key]) => key === match[1]);
    if (!hit) continue;
    const qtKey = Number(match[2]);
    const code = qtToCode(qtKey);
    if (code) result[hit[0]] = code;
  }
  return result;
}

/** 'keyboard' | 'gamepad' as last written by Nest (defaults to keyboard). */
export function readAzaharMode(root: string): 'keyboard' | 'gamepad' {
  const value = readMarker(path.join(root, '.nest-controls-mode'));
  return value === 'gamepad' ? 'gamepad' : 'keyboard';
}
