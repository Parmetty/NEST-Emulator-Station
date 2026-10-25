#!/usr/bin/env node
/**
 * Stand-in emulator. It behaves like a real engine from the supervisor's point
 * of view — prints a banner, exits with a code — but needs no ROM and no
 * Windows binary, so tests and CI can exercise the whole launch path.
 *
 *   node tools/fake-engine.mjs --rom demo.gba
 *   node tools/fake-engine.mjs --rom demo.wbfs --system
 *   node tools/fake-engine.mjs --rom broken.gba --crash
 *   node tools/fake-engine.mjs --rom slow.gba --hang
 */
const args = process.argv.slice(2);

const opt = (name, fallback = '') => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? fallback : fallback;
};

const rom = opt('--rom', '(no rom)');
const firmware = args.includes('--system');
const crash = args.includes('--crash');
const hang = args.includes('--hang');

console.log(`[fake] boot mode=${firmware ? 'firmware' : 'game'} rom=${rom}`);

setTimeout(() => {
  if (crash) {
    console.error('[fake] catastrophic failure: cpu emulation lost sync');
    process.exit(3);
  }
  console.log('[fake] session over');
  process.exit(0);
}, hang ? 60_000 : 250);
