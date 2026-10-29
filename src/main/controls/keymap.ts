/**
 * Canonical keyboard mapping shared by every engine adapter.
 *
 * The single source of truth is `KeyboardEvent.code` ("KeyW", "ArrowUp",
 * "ShiftRight", …) because that is what the renderer captures and what stays
 * stable across keyboard layouts. Each engine adapter converts from here.
 */
import { PAD_ACTIONS, type KeyboardBindings, type PadAction } from '../../shared/contract';

export const CONTROL_ENGINE_IDS = ['mgba', 'ares', 'dolphin', 'azahar', 'melonds'] as const;

export const WRITABLE_ENGINE_IDS = ['mgba', 'ares', 'dolphin', 'azahar', 'melonds'] as const;
export type ControlEngineId = (typeof CONTROL_ENGINE_IDS)[number];

export function isPadAction(value: string): value is PadAction {
  return (PAD_ACTIONS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------- Qt key ints */
/** Qt special keys (Qt::Key_*), used by mGBA, melonDS and Azahar. */
const NAMED_QT_KEYS: Record<string, number> = {
  Space: 0x20,
  Enter: 0x01000004,
  Escape: 0x01000000,
  Tab: 0x01000001,
  Backspace: 0x01000003,
  Insert: 0x01000006,
  Delete: 0x01000007,
  Home: 0x01000010,
  End: 0x01000011,
  ArrowLeft: 0x01000012,
  ArrowUp: 0x01000013,
  ArrowRight: 0x01000014,
  ArrowDown: 0x01000015,
  PageUp: 0x01000016,
  PageDown: 0x01000017,
  ShiftLeft: 0x01000020,
  ShiftRight: 0x01000020,
  ControlLeft: 0x01000021,
  ControlRight: 0x01000021,
  AltLeft: 0x01000023,
  AltRight: 0x01000023,
  CapsLock: 0x01000024,
  Minus: 0x2d,
  Equal: 0x3d,
  BracketLeft: 0x5b,
  BracketRight: 0x5d,
  Backslash: 0x5c,
  Semicolon: 0x3b,
  Quote: 0x27,
  Comma: 0x2c,
  Period: 0x2e,
  Slash: 0x2f,
  Backquote: 0x60,
};

export function codeToQtKey(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  const fn = /^F([1-9]|1[0-2])$/.exec(code);
  if (fn) return 0x0100002f + Number(fn[1]);
  return Object.prototype.hasOwnProperty.call(NAMED_QT_KEYS, code) ? NAMED_QT_KEYS[code] : null;
}

const QT_TO_CODE = new Map<number, string>();
for (const [code, value] of Object.entries(NAMED_QT_KEYS)) QT_TO_CODE.set(value, code);
// Qt has no separate left/right modifier codes; the Nest UI normalises to "right".
QT_TO_CODE.set(0x01000020, 'ShiftRight');
QT_TO_CODE.set(0x01000021, 'ControlRight');
QT_TO_CODE.set(0x01000023, 'AltRight');
for (let i = 0; i < 26; i += 1) QT_TO_CODE.set(0x41 + i, `Key${String.fromCharCode(0x41 + i)}`);
for (let i = 0; i < 10; i += 1) QT_TO_CODE.set(0x30 + i, `Digit${i}`);
for (let i = 1; i <= 12; i += 1) QT_TO_CODE.set(0x0100002f + i, `F${i}`);

export function qtToCode(value: number): string | null {
  return QT_TO_CODE.get(value) ?? null;
}

/* --------------------------------------------------------- Dolphin names */
/**
 * Dolphin stores keyboard bindings as DirectInput names between backticks,
 * e.g. `Buttons/A = \`SPACE\``. Letters/digits are written as-is.
 */
const DOLPHIN_NAMED: Record<string, string> = {
  Space: 'SPACE',
  Enter: 'RETURN',
  Escape: 'ESCAPE',
  Tab: 'TAB',
  Backspace: 'BACK',
  Insert: 'INSERT',
  Delete: 'DELETE',
  Home: 'HOME',
  End: 'END',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  PageUp: 'PRIOR',
  PageDown: 'NEXT',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
  Minus: 'MINUS',
  Equal: 'EQUALS',
  BracketLeft: 'LBRACKET',
  BracketRight: 'RBRACKET',
  Backslash: 'BACKSLASH',
  Semicolon: 'SEMICOLON',
  Quote: 'APOSTROPHE',
  Comma: 'COMMA',
  Period: 'PERIOD',
  Slash: 'SLASH',
  Backquote: 'GRAVE',
};

export function codeToDolphinName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return DOLPHIN_NAMED[code] ?? null;
}

export function dolphinNameToCode(name: string): string | null {
  const value = name.trim().toUpperCase();
  if (/^[A-Z]$/.test(value)) return `Key${value}`;
  if (/^[0-9]$/.test(value)) return `Digit${value}`;
  if (/^F([1-9]|1[0-2])$/.test(value)) return value;
  for (const [code, mapped] of Object.entries(DOLPHIN_NAMED)) {
    if (mapped === value) return code;
  }
  return null;
}

/* --------------------------------------------------------- ares assignments */
/**
 * ares stores an input binding as `0x<deviceID>/<groupID>/<inputID>;;`.
 *
 * Everything here was confirmed against the ares 148 sources (see
 * docs/KEYS-ARES-FORMAT.md):
 * - deviceID: keyboard is `0x1`; the value is (pathID<<32)|(vendorID<<16)|productID
 *   with the keyboard's hard-coded GenericVendorID/GenericProductID (0x0000/0x0001),
 *   so it does not change between machines.
 * - groupID: 0 (HID::Keyboard::GroupID::Button is the only keyboard group).
 * - inputID: **decimal** index into ruby/input/keyboard/rawinput.cpp `keys[]` —
 *   NOT a virtual-key code and NOT a scancode. ares parses it with nall's
 *   decimal `natural()`: it stops at the first non-digit, which is why the old
 *   VK-hex attempt decoded `4a` as 4 and `d` as 0.
 * - The trailing `;;` is how ares saves three mapping slots joined with `;`
 *   (trimRight leaves two separators). Two slots empty = `;;`; the bare
 *   `0x1/0/<id>` is also accepted, but we mirror ares' own output.
 */

/** ares v148 Windows: inputID is the decimal index of ruby's rawinput key table. */
const ARES_KEY_INDEX: Record<string, number> = {
  // 0 = Escape is reserved by ares and cannot be bound.
  F1: 1,
  F2: 2,
  F3: 3,
  F4: 4,
  F5: 5,
  F6: 6,
  F7: 7,
  F8: 8,
  F9: 9,
  F10: 10,
  F11: 11,
  F12: 12,
  PrintScreen: 13,
  ScrollLock: 14,
  Backquote: 15,
  Digit1: 16,
  Digit2: 17,
  Digit3: 18,
  Digit4: 19,
  Digit5: 20,
  Digit6: 21,
  Digit7: 22,
  Digit8: 23,
  Digit9: 24,
  Digit0: 25,
  Minus: 26,
  Equal: 27,
  Backspace: 28,
  Insert: 29,
  Delete: 30,
  Home: 31,
  End: 32,
  PageUp: 33,
  PageDown: 34,
  KeyA: 35,
  KeyB: 36,
  KeyC: 37,
  KeyD: 38,
  KeyE: 39,
  KeyF: 40,
  KeyG: 41,
  KeyH: 42,
  KeyI: 43,
  KeyJ: 44,
  KeyK: 45,
  KeyL: 46,
  KeyM: 47,
  KeyN: 48,
  KeyO: 49,
  KeyP: 50,
  KeyQ: 51,
  KeyR: 52,
  KeyS: 53,
  KeyT: 54,
  KeyU: 55,
  KeyV: 56,
  KeyW: 57,
  KeyX: 58,
  KeyY: 59,
  KeyZ: 60,
  BracketLeft: 61,
  BracketRight: 62,
  Backslash: 63,
  Semicolon: 64,
  Quote: 65,
  Comma: 66,
  Period: 67,
  Slash: 68,
  Numpad1: 69,
  Numpad2: 70,
  Numpad3: 71,
  Numpad4: 72,
  Numpad5: 73,
  Numpad6: 74,
  Numpad7: 75,
  Numpad8: 76,
  Numpad9: 77,
  Numpad0: 78,
  NumpadDecimal: 79,
  NumpadEnter: 80,
  NumpadAdd: 81,
  NumpadSubtract: 82,
  NumpadMultiply: 83,
  NumpadDivide: 84,
  CapsLock: 85,
  ArrowUp: 86,
  ArrowDown: 87,
  ArrowLeft: 88,
  ArrowRight: 89,
  Tab: 90,
  Enter: 91,
  Space: 92,
  ShiftLeft: 93,
  ShiftRight: 94,
  ControlLeft: 95,
  ControlRight: 96,
  AltLeft: 97,
  AltRight: 98,
  MetaLeft: 99,
  MetaRight: 100,
  ContextMenu: 101,
};

const ARES_INDEX_TO_CODE = new Map<number, string>();
for (const [code, index] of Object.entries(ARES_KEY_INDEX)) ARES_INDEX_TO_CODE.set(index, code);

/** `KeyboardEvent.code` → ares decimal key index, or null when unmappable. */
export function codeToAresKeyIndex(code: string): number | null {
  const index = ARES_KEY_INDEX[code];
  return index == null ? null : index;
}

/** `KeyboardEvent.code` → ares assignment, e.g. `0x1/0/57;;` for W. */
export function codeToAresAssignment(code: string): string | null {
  const index = codeToAresKeyIndex(code);
  return index == null ? null : `0x1/0/${index};;`;
}

/** ares assignment → `KeyboardEvent.code`; empty bindings return null. */
export function aresAssignmentToCode(assignment: string): string | null {
  const value = assignment.trim();
  if (value.length === 0 || value === ';;') return null;
  const bare = value.endsWith(';;') ? value.slice(0, -2) : value;
  const tokens = bare.split('/');
  if (tokens.length !== 3) return null;
  const index = Number.parseInt(tokens[2], 10);
  if (!Number.isFinite(index)) return null;
  return ARES_INDEX_TO_CODE.get(index) ?? null;
}

/* ----------------------------------------------------- per-engine defaults */
/**
 * Keyboard defaults per engine. These intentionally keep the layouts that were
 * hand-verified against each emulator instead of forcing one global layout:
 * GBA / DS / 3DS share the handheld layout (Space = A, J = B, arrows = d-pad),
 * GameCube uses the Dolphin layout Nest has shipped since P3.
 */
export const DEFAULT_KEYBOARD: Record<ControlEngineId, KeyboardBindings> = {
  mgba: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    a: 'Space',
    b: 'KeyJ',
    l: 'KeyQ',
    r: 'KeyE',
    start: 'Enter',
    select: 'Backspace',
  },
  ares: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    a: 'KeyJ',
    b: 'KeyK',
    x: 'KeyU',
    y: 'KeyI',
    l: 'KeyQ',
    r: 'KeyE',
    start: 'Enter',
    select: 'ShiftRight',
  },
  dolphin: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    a: 'Space',
    b: 'KeyJ',
    x: 'KeyK',
    y: 'KeyL',
    l: 'KeyQ',
    r: 'KeyE',
    start: 'Enter',
  },
  azahar: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    a: 'Space',
    b: 'KeyJ',
    x: 'KeyK',
    y: 'KeyL',
    l: 'KeyQ',
    r: 'KeyE',
    start: 'Enter',
    select: 'Backspace',
  },
  melonds: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    a: 'Space',
    b: 'KeyJ',
    x: 'KeyK',
    y: 'KeyL',
    l: 'KeyQ',
    r: 'KeyE',
    start: 'Enter',
    select: 'Backspace',
  },
};

export function defaultBindings(engineId: string): KeyboardBindings {
  if (!(CONTROL_ENGINE_IDS as readonly string[]).includes(engineId)) return {};
  return { ...DEFAULT_KEYBOARD[engineId as ControlEngineId] };
}
