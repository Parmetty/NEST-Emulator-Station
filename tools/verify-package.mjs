#!/usr/bin/env node
// Scans a staged portable folder for user data that must never ship.
//
// Run:  node tools/verify-package.mjs dist/portable/Nest-<ver>
//
// Exits 1 and lists every offending path. Keep this in the release flow: the
// Wii U MLC leaked into v0.6.0 because packaging only scrubbed individual Cemu
// files instead of the whole portable/ folder.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node tools/verify-package.mjs <staged-portable-dir>');
  process.exit(2);
}

const FORBIDDEN_DIRS = new Set([
  'mlc01',
  'dev_flash',
  'dev_flash2',
  'dev_flash3',
  'dev_hdd0',
  'dev_hdd1',
  'dev_bdvd',
  'dev_usb000',
  'savestates',
  'saves',
]);
const FORBIDDEN_FILES = new Set([
  'keys.txt',
  'prod.keys',
  'title.keys',
  'eeprom.bin',
  'xemu.toml',
  'melonDS.toml',
  'melonDS.ini',
  'wfcsettings.bin',
  'xenia-canary.config.toml',
  'shader_cache_list',
]);
const FORBIDDEN_SUFFIXES = ['.qcow2', '.nand', '.wud', '.wux', '.wua', '.pup'];
const FORBIDDEN_STATE = ['.nest-controls', '.before-nest', '.before-headless'];
const LOCAL_PATH = /[A-Za-z]:[\\/]+(workstop|Users[\\/]+)/i;

const problems = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (FORBIDDEN_DIRS.has(entry.name) || FORBIDDEN_STATE.some((s) => entry.name.startsWith(s))) {
        problems.push(full);
      }
      walk(full);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (
      FORBIDDEN_FILES.has(entry.name) ||
      FORBIDDEN_SUFFIXES.some((s) => lower.endsWith(s)) ||
      FORBIDDEN_STATE.some((s) => entry.name.startsWith(s))
    ) {
      problems.push(full);
      continue;
    }
    if (/\.(ini|toml|cfg|conf|json|txt|xml|yml|yaml)$/i.test(entry.name) && statSync(full).size < 4 * 1024 * 1024) {
      try {
        if (LOCAL_PATH.test(readFileSync(full, 'utf8'))) problems.push(full);
      } catch {
        /* unreadable: ignore */
      }
    }
  }
}

walk(root);
if (problems.length > 0) {
  console.error('PACKAGE VERIFY FAILED: user data or build-machine paths found:');
  for (const p of problems.slice(0, 60)) console.error(`  ${p.replace(root, '.')}`);
  process.exit(1);
}
console.log('package verify ok: no user data, no local paths');
