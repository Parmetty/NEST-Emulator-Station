#!/usr/bin/env node
// Recreates the local-only folder junctions that tools/clean-engines.mjs
// removes for a release build (it never follows them, see removeEntry()).
//
// Run:  node tools/dev-links.mjs
//
// These links only exist on the developer machine: user firmware stays in
// E:\workstop\nest-assets and is never committed or packaged.
import { existsSync, lstatSync, mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const links = [
  {
    label: 'cemu mlc01 (Wii U NAND)',
    link: path.join(repoRoot, 'resources', 'engines', 'cemu', 'portable', 'mlc01'),
    target: path.join(repoRoot, '..', 'nest-assets', 'firmware', 'wiiu', 'mlc01'),
  },
  {
    label: 'rpcs3 dev_flash',
    link: path.join(repoRoot, 'resources', 'engines', 'rpcs3', 'dev_flash'),
    target: path.join(repoRoot, '..', 'nest-assets', 'firmware', 'ps3', 'dev_flash'),
  },
];

for (const { label, link, target } of links) {
  if (existsSync(link)) {
    const stat = lstatSync(link);
    if (stat.isSymbolicLink()) {
      console.log(`ok      ${label}: ${link}`);
      continue;
    }
    console.log(`skip    ${label}: real folder exists (${link})`);
    continue;
  }
  if (!existsSync(target)) {
    console.log(`missing ${label}: target not found (${target})`);
    continue;
  }
  mkdirSync(path.dirname(link), { recursive: true });
  try {
    symlinkSync(target, link, 'junction');
    console.log(`linked  ${label}: ${link} -> ${target}`);
  } catch (error) {
    console.log(`failed  ${label}: ${error.message}`);
  }
}
