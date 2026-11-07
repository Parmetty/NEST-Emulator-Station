/**
 * RPCS3 keyboard adapter.
 *
 * RPCS3 stores per-player bindings in `config/input_configs/global/Default.yml`.
 * The keyboard pad handler expands a key code into a `Config:` map. Nest writes
 * a Player 1 block and keeps RPCS3's data next to the bundled engine.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { KeyboardBindings, PadAction } from '../../shared/contract';
import { backupOnce, readTextFile, writeTextFile } from './util';

const YAML = path.join('config', 'input_configs', 'global', 'Default.yml');
const CONFIG = path.join('config', 'config.yml');

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
  ['l', 'L1'],
  ['r', 'R1'],
];

const NAMED: Record<string, string> = {
  Enter: 'Return',
  Backspace: 'Backspace',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

export function codeToRpcs3Key(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

function yamlFile(engineDir: string): string {
  return path.join(engineDir, YAML);
}

function ensureConfig(engineDir: string): void {
  const file = path.join(engineDir, CONFIG);
  if (!existsSync(file)) return;
  const text = readTextFile(file);
  let next = text;
  next = next.replace(/Keyboard:\s*"[^"]*"/, 'Keyboard: "Keyboard"');
  next = next.replace(/Start games in fullscreen mode:\s*(true|false)/, 'Start games in fullscreen mode: false');
  if (next !== text) {
    backupOnce(file);
    writeTextFile(file, next);
  }
}

export function applyRpcs3Controls(
  engineDir: string,
  bindings: KeyboardBindings,
  _force: boolean,
): { applied: boolean; files: string[]; reason?: 'custom' | 'unsupported' } {
  const file = yamlFile(engineDir);
  mkdirSync(path.dirname(file), { recursive: true });
  ensureConfig(engineDir);
  backupOnce(file);

  const lines = [
    'Player 1 Input:',
    '  Handler: Keyboard',
    '  Device: Keyboard',
    '  Config:',
  ];
  for (const [action, button] of BUTTONS) {
    const code = bindings[action];
    if (!code) continue;
    const key = codeToRpcs3Key(code);
    if (!key) continue;
    lines.push(`    ${button}: ${key}`);
  }
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return { applied: true, files: [file] };
}

export function readRpcs3Controls(engineDir: string): KeyboardBindings | null {
  const text = readTextFile(yamlFile(engineDir));
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const values = new Map<string, string>();
  let inConfig = false;
  for (const line of lines) {
    if (line.trim() === 'Config:') {
      inConfig = true;
      continue;
    }
    if (inConfig && !line.startsWith('    ')) {
      inConfig = false;
      continue;
    }
    if (!inConfig) continue;
    const match = /^\s+([^:]+):\s*"?([^"]*)"?\s*$/.exec(line);
    if (match) values.set(match[1].trim(), match[2].trim());
  }
  const bindings: KeyboardBindings = {};
  for (const [action, button] of BUTTONS) {
    const key = values.get(button);
    if (!key) continue;
    const code = keyToCode(key);
    if (code) bindings[action] = code;
  }
  return bindings;
}

function keyToCode(name: string): string | null {
  if (/^[A-Z]$/.test(name)) return `Key${name}`;
  if (/^[0-9]$/.test(name)) return `Digit${name}`;
  for (const [code, mapped] of Object.entries(NAMED)) {
    if (mapped === name) return code;
  }
  return null;
}
