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

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync, lstatSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const enginesDir = join(root, 'resources', 'engines');
const checkOnly = process.argv.includes('--check');

const removed = [];
const scrubbed = [];
const problems = [];

/**
 * Junctions (used by the developer to link user firmware into the engine dir)
 * must be unlinked, never traversed: rmSync(recursive) on a junction would
 * delete the linked firmware inside nest-assets.
 */
function removeEntry(full) {
  try {
    if (lstatSync(full).isSymbolicLink()) {
      // Junction/symlink: unlinkSync fails with EPERM on directory junctions,
      // rmdirSync removes the link without touching its target.
      try {
        unlinkSync(full);
      } catch {
        rmdirSync(full);
      }
      return;
    }
    rmSync(full, { recursive: true, force: true });
  } catch {
    /* ignore: already gone or locked */
  }
}

/** Files the engines recreate on first launch — never ship them. */
const RUNTIME_FILES = [
  'melonds/melonDS.toml',
  'melonds/melonDS.ini',
  'melonds/wfcsettings.bin',
  // cemu/portable is handled as a whole directory below (it can hold the
  // user's Wii U NAND junction).

  'xemu/xemu.toml',
  'xemu/xemu.log',
  'xemu/eeprom.bin',
  'xemu/shader_cache_list',
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

/**
 * Cemu portable/ holds the imported NAND (mlc01 junction), keys and user
 * settings — never ship any of it. The empty folder must stay: Cemu enables
 * portable mode when a `portable` directory exists next to the exe, so keep it
 * alive with a marker file that carries no user data.
 */
function scrubCemuPortable() {
  const portableDir = join(enginesDir, 'cemu', 'portable');
  if (!existsSync(portableDir)) return;
  for (const entry of readdirSync(portableDir, { withFileTypes: true })) {
    const full = join(portableDir, entry.name);
    if (entry.name === '.nest-portable') continue;
    if (entry.name === 'keys.txt' || entry.name === 'settings.xml') continue; // handled by RUNTIME_FILES
    removed.push(relative(root, full));
    if (!checkOnly) removeEntry(full);
  }
  if (!checkOnly) {
    mkdirSync(portableDir, { recursive: true });
    const marker = join(portableDir, '.nest-portable');
    if (!existsSync(marker)) writeFileSync(marker, '');
  }
}

scrubCemuPortable();

/** PPSSPP portable mode keeps memstick/config next to the exe; never ship user data. */
function scrubPpsspp() {
  const engineDir = join(enginesDir, 'ppsspp');
  if (!existsSync(engineDir)) return;
  // flash0 may be a junction to a firmware folder outside the repo; unlink the
  // junction only, never recurse through it and delete the user's firmware.
  const flash0 = join(engineDir, 'memstick', 'PSP', 'NAND', 'flash0');
  if (existsSync(flash0)) {
    try {
      if (lstatSync(flash0).isSymbolicLink()) {
        removed.push(relative(root, flash0));
        if (!checkOnly) rmSync(flash0, { force: true });
      }
    } catch {
      /* best effort */
    }
  }

  for (const name of ['memstick', 'portable.txt']) {
    const full = join(engineDir, name);
    if (!existsSync(full)) continue;
    removed.push(relative(root, full));
    if (!checkOnly) rmSync(full, { recursive: true, force: true });
  }
}

scrubPpsspp();

/** Xenia keeps profiles/saves/cache next to the exe in portable mode. */
function scrubXeniaRuntime() {
  const engineDir = join(enginesDir, 'xenia');
  if (!existsSync(engineDir)) return;
  for (const name of ['cache', 'cache0', 'cache1', 'cache_host', 'content']) {
    const full = join(engineDir, name);
    if (!existsSync(full)) continue;
    removed.push(relative(root, full));
    if (!checkOnly) rmSync(full, { recursive: true, force: true });
  }
  for (const name of ['xconfig.settings', 'xenia.log', 'recent.toml', 'xenia-canary.config.toml', 'xenia-canary.config.toml.before-headless']) {
    const full = join(engineDir, name);
    if (!existsSync(full)) continue;
    removed.push(relative(root, full));
    if (!checkOnly) rmSync(full, { force: true });
  }
}

scrubXeniaRuntime();

/** RPCS3 is linked from a test installation outside the repo; never follow it into the zip. */
function scrubRpcs3() {
  const link = join(enginesDir, 'rpcs3');
  if (!existsSync(link)) return;
  try {
    if (lstatSync(link).isSymbolicLink()) {
      removed.push(relative(root, link));
      if (!checkOnly) rmSync(link, { force: true });
    }
  } catch {
    /* ignore */
  }
}

scrubRpcs3();

/** RPCS3 user firmware/HDD/config must never be packaged. */
function scrubRpcs3Runtime() {
  const engineDir = join(enginesDir, 'rpcs3');
  if (!existsSync(engineDir)) return;
  for (const name of ['dev_flash', 'dev_flash2', 'dev_flash3', 'dev_hdd0', 'dev_hdd1', 'dev_bdvd', 'dev_usb000', 'cache', 'log', 'captures', 'savestates', 'games', 'shaderlog', 'ppu_progs', 'spu_progs']) {
    const full = join(engineDir, name);
    if (!existsSync(full)) continue;
    removed.push(relative(root, full));
    if (!checkOnly) removeEntry(full);
  }
  for (const name of ['config']) {
    const full = join(engineDir, name);
    if (!existsSync(full)) continue;
    removed.push(relative(root, full));
    if (!checkOnly) removeEntry(full);
  }
}

scrubRpcs3Runtime();

/** xemu compiles shaders into <engine>/shaders; keep the released engine clean. */
function scrubXemuRuntime() {
  const dir = join(enginesDir, 'xemu', 'shaders');
  if (!existsSync(dir)) return;
  removed.push(relative(root, dir));
  if (!checkOnly) removeEntry(dir);
}

scrubXemuRuntime();

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

/**
 * Leak guard: user firmware/NAND/saves must never reach a portable package.
 * Names are checked after cleaning, so a missed scrub fails the release build.
 */
const FORBIDDEN_NAMES = [
  'mlc01',
  'dev_flash',
  'dev_flash2',
  'dev_flash3',
  'dev_hdd0',
  'dev_hdd1',
  'dev_bdvd',
  'dev_usb000',
  'keys.txt',
  'prod.keys',
  'title.keys',
  'eeprom.bin',
  'xemu.toml',
];
const FORBIDDEN_SUFFIXES = ['.qcow2', '.nand', '.wud', '.wux', '.wua', '.pup'];
const leaks = [];
if (existsSync(enginesDir)) {
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      if (entry.isDirectory()) {
        if (FORBIDDEN_NAMES.includes(entry.name)) leaks.push(rel);
        walk(full);
        continue;
      }
      const lower = entry.name.toLowerCase();
      if (FORBIDDEN_NAMES.includes(entry.name) || FORBIDDEN_SUFFIXES.some((s) => lower.endsWith(s))) {
        leaks.push(rel);
      }
    }
  })(enginesDir);
}
if (leaks.length > 0) {
  console.error('USER DATA LEAK: engine folder still contains firmware/NAND/saves:');
  for (const rel of leaks.slice(0, 40)) console.error(`  ${rel}`);
  problems.push('user-data-leak');
}

if (!checkOnly && !removed.length && !scrubbed.length) console.log('engines already clean');
process.exit(problems.length > 0 ? 1 : 0);
