/**
 * Cemu keyboard adapter (Wii U GamePad profile).
 *
 * Cemu stores per-controller mappings in
 * `<engine>/portable/controllerProfiles/controller0.xml`:
 *
 *   <emulated_controller>
 *     <type>Wii U GamePad</type>
 *     <controller>
 *       <api>Keyboard</api> …
 *       <mappings>
 *         <entry><mapping>1</mapping><button>32</button></entry>  <!-- A = Space -->
 *       </mappings>
 *     </controller>
 *   </emulated_controller>
 *
 * `<mapping>` is the emulated button id from Cemu's `VPADController::ButtonId`
 * enum (see src/input/emulated/VPADController.h in the Cemu sources) and
 * `<button>` is a Windows virtual-key code.
 *
 * The profile flag `<ControllerProfiles>true</ControllerProfiles>` in
 * `portable/settings.xml` has to be on, otherwise Cemu ignores these files.
 */
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { codeToVk, vkToCode } from './keymap';
import {
  backupOnce,
  readMarker,
  readTextFile,
  writeMarker,
  writeTextFile,
  type ApplyResult,
} from './util';

const MARKER = '.nest-controls-v1';
const PROFILE_DIR = path.join('portable', 'controllerProfiles');
const PROFILE_FILE = 'controller0.xml';
const SETTINGS_FILE = path.join('portable', 'settings.xml');

/** Emulated button ids (VPADController::ButtonId, 1-based). */
const BUTTON_IDS: Record<PadAction, number> = {
  a: 1,
  b: 2,
  x: 3,
  y: 4,
  l: 5,
  r: 6,
  start: 9,
  select: 10,
  up: 11,
  down: 12,
  left: 13,
  right: 14,
};

/** Left/right stick directions are bound to the same keys as the d-pad. */
const STICK_IDS: Array<[PadAction, number]> = [
  ['up', 17],
  ['down', 18],
  ['left', 19],
  ['right', 20],
  ['up', 21],
  ['down', 22],
  ['left', 23],
  ['right', 24],
];

/** ZL/ZR have no PadAction in Nest; keep the keys used by the reference profile. */
const ZL_VK = 0x31; // '1'
const ZR_VK = 0x32; // '2'

const ACTION_ORDER: PadAction[] = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select'];

export interface CemuPaths {
  engineDir: string;
}

function profilePath(engineDir: string): string {
  return path.join(engineDir, PROFILE_DIR, PROFILE_FILE);
}

function settingsPath(engineDir: string): string {
  return path.join(engineDir, SETTINGS_FILE);
}

const XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<emulated_controller>
\t<type>Wii U GamePad</type>
\t<toggle_display>0</toggle_display>
\t<controller>
\t\t<api>Keyboard</api>
\t\t<uuid>keyboard</uuid>
\t\t<display_name>Keyboard</display_name>
\t\t<axis>
\t\t\t<deadzone>0.25</deadzone>
\t\t\t<range>1</range>
\t\t</axis>
\t\t<rotation>
\t\t\t<deadzone>0.25</deadzone>
\t\t\t<range>1</range>
\t\t</rotation>
\t\t<trigger>
\t\t\t<deadzone>0.25</deadzone>
\t\t\t<range>1</range>
\t\t</trigger>
\t\t<mappings>
`;

function xmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Bindings in Cemu order: buttons first, then the duplicated stick axes. */
export function cemuBindingsToEntries(bindings: KeyboardBindings): Array<[number, number]> {
  const entries: Array<[number, number]> = [];
  for (const action of ACTION_ORDER) {
    const vk = bindings[action] ? codeToVk(bindings[action]!) : null;
    if (vk == null) continue;
    entries.push([BUTTON_IDS[action], vk]);
  }
  entries.push([7, ZL_VK]);
  entries.push([8, ZR_VK]);
  for (const [action, id] of STICK_IDS) {
    const vk = bindings[action] ? codeToVk(bindings[action]!) : null;
    if (vk == null) continue;
    entries.push([id, vk]);
  }
  return entries;
}

export function renderCemuProfile(bindings: KeyboardBindings): string {
  const entries = cemuBindingsToEntries(bindings);
  const body = entries
    .map(
      ([mapping, button]) =>
        `\t\t\t<entry>\n\t\t\t\t<mapping>${mapping}</mapping>\n\t\t\t\t<button>${button}</button>\n\t\t\t</entry>\n`,
    )
    .join('');
  return `${XML_HEAD}${body}\t\t</mappings>\n\t</controller>\n</emulated_controller>\n`;
}

/** Reads the first emulated controller's mappings back into Nest bindings. */
export function parseCemuProfile(text: string): KeyboardBindings {
  const bindings: KeyboardBindings = {};
  const byButton = new Map<number, string>();
  const entryRe = /<mapping>\s*(\d+)\s*<\/mapping>\s*<button>\s*(\d+)\s*<\/button>/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(text)) !== null) {
    const mapping = Number(match[1]);
    const vk = Number(match[2]);
    const code = vkToCode(vk);
    if (code) byButton.set(mapping, code);
  }
  for (const action of ACTION_ORDER) {
    const code = byButton.get(BUTTON_IDS[action]);
    if (code) bindings[action] = code;
  }
  return bindings;
}

/** Make sure Cemu actually loads controller profiles. */
function ensureProfilesEnabled(engineDir: string): void {
  const file = settingsPath(engineDir);
  const text = readTextFile(file);
  if (!text) return;
  const patched = text.replace(
    /<ControllerProfiles>\s*(?:false|0)\s*<\/ControllerProfiles>/i,
    '<ControllerProfiles>true</ControllerProfiles>',
  );
  if (patched !== text) writeTextFile(file, patched);
}

export function applyCemuControls(
  engineDir: string,
  bindings: KeyboardBindings,
  force: boolean,
): ApplyResult {
  const file = profilePath(engineDir);
  const marker = path.join(engineDir, MARKER);
  const existing = readTextFile(file);

  // Never overwrite a hand-made profile on launch; a save from the key panel
  // (force) replaces it after taking a backup.
  if (!force && existing.length > 0 && !readMarker(marker)) {
    return { applied: false, files: [], reason: 'custom' };
  }

  backupOnce(file);
  writeTextFile(file, renderCemuProfile(bindings));
  ensureProfilesEnabled(engineDir);
  writeMarker(marker, 'managed');
  return { applied: true, files: [file, settingsPath(engineDir)] };
}

export function readCemuControls(engineDir: string): KeyboardBindings | null {
  const text = readTextFile(profilePath(engineDir));
  if (!text) return null;
  return parseCemuProfile(text);
}

/** Exposed for tests: the virtual-key code Cemu would receive for a PadAction. */
export function cemuButtonFor(code: string): number | null {
  return codeToVk(code);
}
