#!/usr/bin/env node
// Install WiiUDownloader output folders into a Cemu mlc01 tree.
//
// WiiUDownloader writes two sibling folders for a title:
//   <root>/<Name> [System App] [0005001010040000]/        raw WUP: title.tmd/tik/cert + .app files
//   <root>/decrypted/<Name> [System App] [0005001010040000]/ decrypted FST: code/ content/ meta/
//
// Cemu's mlc01 needs the FST tree plus title.tmd/title.tik at the title root:
//   mlc01/sys/title/00050010/10040000/  (sys apps, 00050010 / 0005001b)
//   mlc01/usr/title/00050000/1010XXXX/  (games/updates/DLC go to usr)
//
// Usage:
//   node tools/wiiu/install-title.mjs [--root E:\workstop] [--mlc <path>] [--force] [--dry-run]
//
// Auto-detects every "<...> [0005001010040000]" folder that has a decrypted sibling.

import { existsSync, readdirSync, mkdirSync, copyFileSync, statSync, cpSync } from 'node:fs';
import { join, basename } from 'node:path';

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
const rootArg = arg('root', 'E:\\workstop');
const rawRootArg = arg('raw-root', rootArg);
const decRootArg = arg('dec-root', join(rootArg, 'decrypted'));
const mlcArg = arg('mlc', 'E:\\workstop\\nest\\resources\\engines\\cemu\\portable\\mlc01');
const force = argv.includes('--force');
const dryRun = argv.includes('--dry-run');

/** Map a 16-hex title id to its mlc01 title directory. */
function targetDir(mlc, titleId) {
  const hi = titleId.slice(0, 8).toLowerCase();
  const lo = titleId.slice(8, 16).toLowerCase();
  const sysPrefixes = new Set(['00050010', '0005001b']);
  const top = sysPrefixes.has(hi) ? 'sys' : 'usr';
  return join(mlc, top, 'title', hi, lo);
}

/** Find "<anything> [00050010xxxxxxxx]" folders under dir (non-recursive). */
function findTitleFolders(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = entry.name.match(/\[([0-9a-fA-F]{16})\]/);
    if (!m) continue;
    out.push({ name: entry.name, titleId: m[1].toLowerCase(), dir: join(dir, entry.name) });
  }
  return out;
}

const rawRoot = rawRootArg;
const decRoot = decRootArg;
const raws = findTitleFolders(rawRoot);
const decs = new Map(findTitleFolders(decRoot).map((t) => [t.titleId, t]));

if (raws.length === 0 && decs.size === 0) {
  console.error(`no "<name> [titleid]" folders found under ${rawRoot} or ${decRoot}`);
  process.exit(1);
}

let installed = 0;
let skipped = 0;
for (const raw of raws) {
  const dec = decs.get(raw.titleId);
  if (!dec) {
    console.warn(`skip ${raw.name}: no decrypted folder`);
    skipped++;
    continue;
  }

  const tmd = join(raw.dir, 'title.tmd');
  const tik = join(raw.dir, 'title.tik');
  if (!existsSync(tmd) || !existsSync(tik)) {
    console.warn(`skip ${raw.name}: title.tmd/title.tik missing in raw folder`);
    skipped++;
    continue;
  }

  const dst = targetDir(mlcArg, raw.titleId);
  const marker = join(dst, 'title.tmd');
  if (existsSync(marker) && !force) {
    console.log(`skip ${raw.titleId}: already installed (use --force)`);
    skipped++;
    continue;
  }

  console.log(`${dryRun ? '[dry] ' : ''}install ${raw.titleId} -> ${dst}`);
  if (dryRun) {
    installed++;
    continue;
  }

  mkdirSync(dst, { recursive: true });
  for (const part of ['code', 'content', 'meta']) {
    const src = join(dec.dir, part);
    if (!existsSync(src)) continue;
    cpSync(src, join(dst, part), { recursive: true, force: true });
  }
  for (const f of ['title.tmd', 'title.tik']) {
    copyFileSync(join(raw.dir, f), join(dst, f));
  }
  const cert = join(raw.dir, 'title.cert');
  if (existsSync(cert)) copyFileSync(cert, join(dst, 'title.cert'));
  installed++;
}

console.log(`\ninstalled=${installed} skipped=${skipped} mlc=${mlcArg}`);
