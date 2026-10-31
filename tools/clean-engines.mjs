#!/usr/bin/env node
// Scrubs machine-specific state out of the bundled engines before packaging.
//
// Emulators write their settings *next to their executable*, so after any local
// test run the engine folders contain window positions, recent-ROM lists and
// absolute paths from this workstation. Shipping those leaks the developer's
// directory layout (and breaks first-run defaults for everyone else), so the
// release build always starts from a clean config.
//
// Run:  node tools/clean-engines.mjs [--check]
//   --check  only report problems, exit 1 if anything would change.

import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const enginesDir = join(root, 'resources', 'engines');
const checkOnly = process.argv.includes('--check');

const removed = [];
const scrubbed = [];
const problems = [];

/** Files the engines recreate on first launch — never ship them. */
const RUNTIME_FILES = [
  'melonds/melonDS.toml',
  'melonds/melonDS.ini',
  'melonds/wfcsettings.bin',
  'cemu/portable/keys.txt',
  'cemu/portable/settings.xml',
  'cemu/portable/controllerProfiles.xml',
  'cemu/portable/gameProfiles.xml',
];

for (const relativePath of RUNTIME_FILES) {
  const file = join(enginesDir, relativePath);
  if (!existsSync(file)) continue;
  removed.push(relativePath);
  if (!checkOnly) rmSync(file, { force: true });
}

/** mGBA keeps its recent-ROM list in qt.ini; drop the whole [mru] section. */
function scrubMgbaQtIni() {
  const file = join(enginesDir, 'mgba', 'qt.ini');
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  if (!/^\[mru\]/m.test(text)) return;

  const kept = [];
  let inMru = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\[/.test(line)) inMru = line.trim() === '[mru]';
    if (!inMru) kept.push(line);
  }
  scrubbed.push('mgba/qt.ini');
  if (!checkOnly) writeFileSync(file, `${kept.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

scrubMgbaQtIni();

/**
 * Drop every "we already seeded this" marker and pre-seed backup. They are
 * runtime state: shipping them makes a fresh install believe the engine was
 * already configured (and leaks a copy of the old config in `*.before-nest`).
 */
function scrubNestedRuntimeState() {
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const isMarker = entry.name.startsWith(".nest-controls");
      const isBackup = entry.name.endsWith(".before-nest");
      if (!isMarker && !isBackup) continue;
      removed.push(relative(join(root, "resources", "engines"), full));
      if (!checkOnly) rmSync(full, { force: true });
    }
  }
  if (existsSync(enginesDir)) walk(enginesDir);
}

scrubNestedRuntimeState();

/** Cemu portable/ holds the imported NAND, keys and user settings — never ship. */
function scrubCemuPortable() {
  const portableDir = join(enginesDir, 'cemu', 'portable');
  if (!existsSync(portableDir)) return;
  for (const entry of readdirSync(portableDir, { withFileTypes: true })) {
    const full = join(portableDir, entry.name);
    const rel = relative(root, full);
    // keep the folder itself (Cemu needs it for portable mode)
    if (entry.name === 'keys.txt' || entry.name === 'settings.xml') continue; // handled by RUNTIME_FILES
    if (entry.isDirectory() && entry.name === 'mlc01') {
      removed.push(rel);
      if (!checkOnly) rmSync(full, { recursive: true, force: true });
      continue;
    }
    if (entry.name.endsWith('.bin') || entry.name.endsWith('.xml')) {
      removed.push(rel);
      if (!checkOnly) rmSync(full, { force: true });
    }
  }
}

scrubCemuPortable();

/** Anything still pointing at the build machine is a packaging bug. */
const LOCAL_PATH_PATTERNS = [/[A-Za-z]:\\\\workstop/i, /[A-Za-z]:\/workstop/i, /[A-Za-z]:\\\\Users\\\\/i];
const TEXT_EXT = /\.(ini|bml|toml|cfg|conf|json|txt|xml|yml|yaml)$/i;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (TEXT_EXT.test(entry.name)) {
      const rel = relative(root, full);
      const text = readFileSync(full, 'utf8');
      for (const pattern of LOCAL_PATH_PATTERNS) {
        if (pattern.test(text)) {
          problems.push(rel);
          break;
        }
      }
    }
  }
}

if (existsSync(enginesDir)) walk(enginesDir);

if (removed.length) console.log(`removed: ${removed.join(', ')}`);
if (scrubbed.length) console.log(`scrubbed: ${scrubbed.join(', ')}`);
if (problems.length) {
  console.error('local paths still present in:');
  for (const rel of problems) console.error(`  ${rel}`);
}

if (!checkOnly && !removed.length && !scrubbed.length) console.log('engines already clean');
process.exit(problems.length > 0 ? 1 : 0);
