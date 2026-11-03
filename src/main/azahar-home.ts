/**
 * Locate the 3DS HOME Menu NCCH inside an Azahar data directory.
 *
 * Azahar's "Set Up System Files" (Artic Setup Tool) installs the console's
 * system titles under `<azahar>/nand/<SYSTEM_ID>/title/00040030/<low>/content/`.
 * `<low>` differs by region:
 *   00008202 JPN · 00008F02 USA · 00009802 EUR/AUS · 0000A102 CHN · 0000A902 KOR · 0000B102 TWN
 *
 * Azahar's own "Boot Home Menu" menu item simply calls BootGame() with the
 * content path, so handing that path to `azahar.exe` is the same thing without
 * UI automation. When the title is missing we report it instead of booting the
 * plain Azahar GUI.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const HOME_MENU_TITLE_HIGH = '00040030';

/** Candidate Azahar user directories (Roaming first, then Local). */
export function azaharUserDirs(dataRoot: string): string[] {
  return [
    path.join(dataRoot, 'AppData', 'Roaming', 'Azahar'),
    path.join(dataRoot, 'AppData', 'Local', 'Azahar'),
    // A user may also point Nest at a directory that already contains the
    // Azahar data folder directly.
    dataRoot,
  ];
}

function firstAppInContent(contentDir: string): string | null {
  if (!existsSync(contentDir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(contentDir);
  } catch {
    return null;
  }
  const apps = entries.filter((name) => name.toLowerCase().endsWith('.app'));
  if (apps.length === 0) return null;
  // HOME Menu's main content is index 0; pick the largest .app as a fallback
  // (index 0 is normally the biggest content).
  let best: { file: string; size: number } | null = null;
  for (const name of apps) {
    const file = path.join(contentDir, name);
    try {
      const size = statSync(file).size;
      if (!best || size > best.size) best = { file, size };
    } catch {
      /* ignore unreadable entries */
    }
  }
  return best?.file ?? null;
}

/** Returns the HOME Menu `.app` path, or null when the system files are absent. */
export function findAzaharHomeMenu(dataRoot: string): string | null {
  for (const base of azaharUserDirs(dataRoot)) {
    const nandDir = path.join(base, 'nand');
    if (!existsSync(nandDir)) continue;
    let systemDirs: string[];
    try {
      systemDirs = readdirSync(nandDir);
    } catch {
      continue;
    }
    for (const systemId of systemDirs) {
      const titleDir = path.join(nandDir, systemId, 'title', HOME_MENU_TITLE_HIGH);
      if (!existsSync(titleDir)) continue;
      let regions: string[];
      try {
        regions = readdirSync(titleDir);
      } catch {
        continue;
      }
      for (const region of regions) {
        const content = firstAppInContent(path.join(titleDir, region, 'content'));
        if (content) return content;
      }
    }
  }
  return null;
}
