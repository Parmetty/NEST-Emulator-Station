/** Small file helpers shared by the per-engine control adapters. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface ApplyResult {
  applied: boolean;
  /** Files that were written (backups excluded). */
  files: string[];
  /** Why nothing was written; `custom` means the user's own layout was kept. */
  reason?: 'custom' | 'unsupported';
}

export function readTextFile(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

export function writeTextFile(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
}

/** Copy `<file>` to `<file>.before-nest` once; later writes keep the first backup. */
export function backupOnce(file: string): void {
  if (!existsSync(file)) return;
  const backup = `${file}.before-nest`;
  if (existsSync(backup)) return;
  copyFileSync(file, backup);
}

export function readMarker(file: string): string | null {
  if (!existsSync(file)) return null;
  return readTextFile(file).trim();
}

export function writeMarker(file: string, value: string): void {
  writeTextFile(file, `${value}\n`);
}

/** Escape a literal string for use inside a RegExp. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace `key=value` anywhere in an ini file, or add it under `[Controls]`.
 * Azahar's qt-config.ini keeps every control (and its `\default` twin) under
 * `[Controls]`, so a flat upsert is the right primitive there.
 */
export function upsertControl(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, () => line);
  const header = text.indexOf('[Controls]');
  if (header < 0) return `[Controls]\n${line}\n${text}`;
  const insertAt = text.indexOf('\n', header) + 1;
  return `${text.slice(0, insertAt)}${line}\n${text.slice(insertAt)}`;
}

/** Preserve whatever line ending the engine already used. */
export function detectEol(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export function splitLines(text: string): string[] {
  return text.length > 0 ? text.split(/\r?\n/) : [];
}

export interface SectionBounds {
  /** Index of the section header line. */
  start: number;
  /** Index of the first line after the section (exclusive). */
  end: number;
}

export function findSection(lines: string[], header: string): SectionBounds | null {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/**
 * Replace (or append) `key=value` pairs inside one ini/toml section.
 * `format` lets each engine keep its own spacing, e.g. `A = 32` vs `keyA=32`.
 */
export function setSectionEntries(
  lines: string[],
  header: string,
  entries: Array<[key: string, value: string]>,
  format: (key: string, value: string) => string,
): void {
  let bounds = findSection(lines, header);
  if (!bounds) {
    lines.push(header);
    bounds = { start: lines.length - 1, end: lines.length };
  }
  // Entries are appended at the end of the section so existing unrelated keys
  // (melonDS hotkeys, mGBA SDL pad bindings, …) keep their position.
  for (const [key, value] of entries) {
    const line = format(key, value);
    let replaced = false;
    for (let i = bounds.start + 1; i < bounds.end; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith(`${key}=`) || trimmed.startsWith(`${key} =`)) {
        lines[i] = line;
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      lines.splice(bounds.end, 0, line);
      bounds.end += 1;
    }
  }
}
