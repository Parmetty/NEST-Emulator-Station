#!/usr/bin/env node
/**
 * Launches the packaged/built app through the local Electron binary.
 *
 * Two environment quirks it fixes:
 *  - `ELECTRON_RUN_AS_NODE=1` (set globally on some machines) makes electron.exe
 *    behave like plain node, so the window never appears.
 *  - nothing else: pass extra args straight through.
 *
 *   node tools/run.mjs . --user-data-dir=.profile
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, process.argv.slice(2), { stdio: 'inherit', env });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
