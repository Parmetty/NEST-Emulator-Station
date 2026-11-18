#!/usr/bin/env node
/**
 * Validate a Nest theme pack against schemas/theme.schema.json.
 *
 * Usage:
 *   node tools/validate-theme.mjs resources/themes/default
 *   node tools/validate-theme.mjs path/to/theme.json
 *
 * Checks the JSON shape, the required fields, and that every referenced asset
 * stays inside the pack and exists. Exit code 1 on any problem.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const schemaPath = path.join(repo, 'schemas', 'theme.schema.json');

const input = process.argv[2];
if (!input) {
  console.error('usage: node tools/validate-theme.mjs <theme-dir|theme.json>');
  process.exit(2);
}
const abs = path.resolve(input);
const packDir = statSync(abs).isDirectory() ? abs : path.dirname(abs);
const themeFile = statSync(abs).isDirectory() ? path.join(abs, 'theme.json') : abs;
if (!existsSync(themeFile)) {
  console.error('missing theme.json: ' + themeFile);
  process.exit(2);
}

let theme;
try {
  theme = JSON.parse(readFileSync(themeFile, 'utf8'));
} catch (error) {
  console.error('invalid JSON: ' + error.message);
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')));
if (!validate(theme)) {
  console.error('theme.json failed schema validation:');
  for (const issue of validate.errors ?? []) {
    console.error('  ' + (issue.instancePath || '/') + ': ' + issue.message);
  }
  process.exit(1);
}

const problems = [];
function checkAsset(rel, label) {
  if (!rel) return;
  const resolved = path.resolve(packDir, rel);
  if (resolved !== packDir && !resolved.startsWith(packDir + path.sep)) {
    problems.push(label + ' escapes the pack: ' + rel);
    return;
  }
  if (!existsSync(resolved)) {
    problems.push(label + ' missing: ' + rel);
    return;
  }
  const size = statSync(resolved).size;
  if (size > 16 * 1024 * 1024) problems.push(label + ' is larger than 16 MB: ' + rel);
}

for (const [key, font] of Object.entries(theme.fonts ?? {})) {
  for (const file of font.files ?? []) checkAsset(file.src, 'fonts.' + key);
}
if (theme.preview) checkAsset(theme.preview, 'preview');
if (theme.background?.image) checkAsset(theme.background.image, 'background.image');
if (theme.assets?.logo) checkAsset(theme.assets.logo, 'assets.logo');

if (problems.length) {
  console.error('theme assets are invalid:');
  for (const problem of problems) console.error('  ' + problem);
  process.exit(1);
}

console.log('OK ' + path.basename(packDir) + ' (' + theme.id + ' v' + theme.version + ')');
