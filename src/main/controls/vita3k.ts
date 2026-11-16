import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { KeyboardBindings } from '../../shared/contract';
import type { ApplyResult } from './util';

/** Nest action -> Vita3K config.yml key. */
const MAP: Array<[keyof KeyboardBindings, string]> = [
  ['up', 'keyboard-button-up'],
  ['down', 'keyboard-button-down'],
  ['left', 'keyboard-button-left'],
  ['right', 'keyboard-button-right'],
  ['a', 'keyboard-button-cross'],
  ['b', 'keyboard-button-circle'],
  ['x', 'keyboard-button-square'],
  ['y', 'keyboard-button-triangle'],
  ['l', 'keyboard-button-l1'],
  ['r', 'keyboard-button-r1'],
  ['start', 'keyboard-button-start'],
  ['select', 'keyboard-button-select'],
];

function configPath(engineDir: string): string {
  return path.join(engineDir, 'config.yml');
}

export function readVita3kControls(engineDir: string): KeyboardBindings {
  const file = configPath(engineDir);
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8');
  const result: KeyboardBindings = {};
  for (const [action, key] of MAP) {
    const match = new RegExp('^' + key + ':\\s*(\\S+)\\s*$', 'm').exec(text);
    if (match) result[action] = match[1];
  }
  return result;
}

export function applyVita3kControls(
  engineDir: string,
  bindings: KeyboardBindings,
  force: boolean,
): ApplyResult {
  const file = configPath(engineDir);
  if (!existsSync(file)) return { applied: false, files: [], reason: 'unsupported' };
  const original = readFileSync(file, 'utf8');
  // At launch we only seed a fresh config; once the player has a layout in
  // Vita3K we leave it alone unless they saved from Nest's key panel.
  if (!force && /^keyboard-button-cross:/m.test(original)) {
    return { applied: false, files: [file], reason: 'custom' };
  }
  let text = original;
  let changed = false;
  for (const [action, key] of MAP) {
    const value = bindings[action];
    if (!value) continue;
    const line = new RegExp('^' + key + ':\\s*.*$', 'm');
    if (line.test(text)) {
      const next = text.replace(line, key + ': ' + value);
      if (next !== text) {
        text = next;
        changed = true;
      }
    } else {
      text += (text.endsWith('\n') ? '' : '\n') + key + ': ' + value + '\n';
      changed = true;
    }
  }
  if (!changed) return { applied: false, files: [file], reason: 'custom' };
  writeFileSync(file, text, 'utf8');
  return { applied: true, files: [file] };
}
