import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { themeWindowChrome } from '../shared/theme';
import { DEFAULT_THEME_ID, themeSchema, type Theme } from '../shared/theme';

export interface ThemeEntry {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  builtin: boolean;
  /** Absolute path to the preview image, when the pack ships one. */
  preview?: string;
  /** Absolute pack directory (used for assets). */
  dir: string;
}

export interface ThemeRoots {
  builtin: string;
  user: string;
}

/** Built-in packs live next to the engines folder; users drop theirs in userData/themes. */
export function resolveThemeRoots(appPath: string, resourcesPath: string, userData: string): ThemeRoots {
  const resources = appPath.endsWith('.asar') ? resourcesPath : path.join(appPath, 'resources');
  return { builtin: path.join(resources, 'themes'), user: path.join(userData, 'themes') };
}

function readTheme(dir: string): Theme | null {
  const file = path.join(dir, 'theme.json');
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const result = themeSchema.safeParse(parsed);
    if (!result.success) {
      console.error('[nest] theme invalid: ' + file + ' -> ' + result.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '));
      return null;
    }
    return result.data;
  } catch (error) {
    console.error('[nest] theme unreadable: ' + file + ' -> ' + (error as Error).message);
    return null;
  }
}

function scanRoot(root: string, builtin: boolean, out: Map<string, ThemeEntry>): void {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const dir = path.join(root, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const theme = readTheme(dir);
    if (!theme) continue;
    const previewFile = theme.preview ? path.join(dir, theme.preview) : path.join(dir, 'preview.webp');
    out.set(theme.id, {
      id: theme.id,
      name: theme.name,
      version: theme.version,
      author: theme.author,
      description: theme.description,
      builtin,
      dir,
      preview: existsSync(previewFile) ? previewFile : undefined,
    });
  }
}

/** User themes override a built-in pack with the same id. */
export function listThemes(roots: ThemeRoots): ThemeEntry[] {
  const map = new Map<string, ThemeEntry>();
  scanRoot(roots.builtin, true, map);
  scanRoot(roots.user, false, map);
  return [...map.values()].sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name));
}

export function loadTheme(roots: ThemeRoots, id: string): Theme | null {
  for (const root of [roots.user, roots.builtin]) {
    const dir = path.join(root, id);
    if (!existsSync(path.join(dir, 'theme.json'))) continue;
    const theme = readTheme(dir);
    if (theme) return theme;
  }
  return null;
}

export function activeTheme(roots: ThemeRoots, id?: string): Theme | null {
  const wanted = id || DEFAULT_THEME_ID;
  return loadTheme(roots, wanted) ?? loadTheme(roots, DEFAULT_THEME_ID);
}

/** Resolve a pack-relative asset without allowing escapes from the theme folder. */
export function themeAsset(entry: ThemeEntry, relative: string): string | null {
  const resolved = path.resolve(entry.dir, relative);
  const base = path.resolve(entry.dir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return existsSync(resolved) ? resolved : null;
}

/** Apply the window-chrome part of a theme (Electron owns the native title bar). */
export function applyThemeToWindow(win: BrowserWindow | null, theme: Theme): void {
  if (!win || win.isDestroyed()) return;
  const chrome = themeWindowChrome(theme);
  try {
    win.setTitleBarOverlay({
      color: chrome.titleBar.background,
      symbolColor: chrome.titleBar.symbolColor,
      height: chrome.titleBar.height,
    });
  } catch (error) {
    console.error('[nest] title bar theme failed', error);
  }
}
