/**
 * Canonical keyboard mapping shared by every engine adapter.
 *
 * The single source of truth is `KeyboardEvent.code` ("KeyW", "ArrowUp",
 * "ShiftRight", …) because that is what the renderer captures and what stays
 * stable across keyboard layouts. Each engine adapter converts from here.
 */
import { PAD_ACTIONS, type KeyboardBindings, type PadAction } from '../../shared/contract';

export const CONTROL_ENGINE_IDS = ['mgba', 'ares', 'dolphin', 'azahar', 'melonds'] as const;
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
 * ares stores an input binding as `0x<deviceID>/<groupID>/<inputID(hex)>;;`.
 * The keyboard is device `0x1`, group `0`, and inputIDs are **Windows virtual
 * key codes** (not SDL scancodes): W = 0x57, Enter = 0x0D, ShiftRight = 0xA1.
 * The trailing `;;` is what ares itself writes; keep it verbatim.
 */
const ARES_NAMED_VK: Record<string, number> = {
  Space: 0x20,
  Enter: 0x0d,
  Escape: 0x1b,
  Tab: 0x09,
  Backspace: 0x08,
  Insert: 0x2d,
  Delete: 0x2e,
  Home: 0x24,
  End: 0x23,
  PageUp: 0x21,
  PageDown: 0x22,
  ArrowLeft: 0x25,
  ArrowUp: 0x26,
  ArrowRight: 0x27,
  ArrowDown: 0x28,
  ShiftLeft: 0xa0,
  ShiftRight: 0xa1,
  ControlLeft: 0xa2,
  ControlRight: 0xa3,
  AltLeft: 0xa4,
  AltRight: 0xa5,
  CapsLock: 0x14,
  Minus: 0xbd,
  Equal: 0xbb,
  BracketLeft: 0xdb,
  BracketRight: 0xdd,
  Backslash: 0xdc,
  Semicolon: 0xba,
  Quote: 0xde,
  Comma: 0xbc,
  Period: 0xbe,
  Slash: 0xbf,
  Backquote: 0xc0,
};

export function codeToAresVk(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  const fn = /^F([1-9]|1[0-2])$/.exec(code);
  if (fn) return 0x6f + Number(fn[1]);
  return Object.prototype.hasOwnProperty.call(ARES_NAMED_VK, code) ? ARES_NAMED_VK[code] : null;
}

const ARES_VK_TO_CODE = new Map<number, string>();
for (const [code, value] of Object.entries(ARES_NAMED_VK)) ARES_VK_TO_CODE.set(value, code);
for (let i = 0; i < 26; i += 1) {
  ARES_VK_TO_CODE.set(0x41 + i, `Key${String.fromCharCode(0x41 + i)}`);
}
for (let i = 0; i < 10; i += 1) ARES_VK_TO_CODE.set(0x30 + i, `Digit${i}`);
for (let i = 1; i <= 12; i += 1) ARES_VK_TO_CODE.set(0x6f + i, `F${i}`);

/** `KeyboardEvent.code` → ares assignment, e.g. "0x1/0/57;;" for W. */
export function codeToAresAssignment(code: string): string | null {
  const vk = codeToAresVk(code);
  if (vk == null) return null;
  // ares formats these with nall::hex(), which uses lowercase digits — mirror it
  // exactly so its own writer and ours agree on the same string.
  return `0x1/0/${vk.toString(16)};;`;
}

/** ares assignment → `KeyboardEvent.code`; empty bindings return null. */
export function aresAssignmentToCode(assignment: string): string | null {
  const value = assignment.trim();
  if (value.length === 0 || value === ';;') return null;
  const bare = value.endsWith(';;') ? value.slice(0, -2) : value;
  const tokens = bare.split('/');
  if (tokens.length !== 3) return null;
  const input = Number.parseInt(tokens[2], 16);
  if (!Number.isFinite(input)) return null;
  return ARES_VK_TO_CODE.get(input) ?? null;
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
