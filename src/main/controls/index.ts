/**
 * Engine controls facade: one entry point for the IPC layer.
 *
 * Each adapter owns one engine's config file format and the "don't clobber a
 * user layout" rules. This module only routes by engine id and hides the
 * directory layout from `ipc.ts`.
 */
import path from 'node:path';
import type { KeyboardBindings } from '../../shared/contract';
import { applyAzaharControls, readAzaharControls, readAzaharMode } from './azahar';
import { applyCemuControls, readCemuControls } from './cemu';
import { applyAresControls, readAresControls } from './ares';
import { applyDolphinControls, readDolphinControls } from './dolphin';
import { applyMgbaControls, readMgbaControls } from './mgba';
import { applyMelondsControls, readMelondsControls } from './melonds';
import { applyPcsx2Controls, readPcsx2Controls } from './pcsx2';
import { CONTROL_ENGINE_IDS, WRITABLE_ENGINE_IDS } from './keymap';
import type { ApplyResult } from './util';

export { CONTROL_ENGINE_IDS, DEFAULT_KEYBOARD, defaultBindings, type ControlEngineId } from './keymap';

export interface ControlPaths {
  /** `<app>/resources/engines` (or `process.resourcesPath/engines` when packaged). */
  enginesDir: string;
  /** Electron `app.getPath('userData')`. */
  userData: string;
}

export interface ApplyControlsOptions {
  /** How many SDL gamepads are connected; Azahar switches layouts based on it. */
  gamepads?: number;
  /** Force a layout instead of probing for gamepads (Azahar only). */
  mode?: 'keyboard' | 'gamepad';
  /** Actual engine folder when it is not the bundled one (user-provided engines). */
  engineDir?: string;
}

export interface ApplyControlsResult extends ApplyResult {
  engineId: string;
  supported: boolean;
}

export function isControlsSupported(engineId: string): boolean {
  return (WRITABLE_ENGINE_IDS as readonly string[]).includes(engineId);
}

/** Which layout the adapter last wrote (Azahar only; everything else is keyboard). */
export function readEngineMode(engineId: string, paths: ControlPaths): 'keyboard' | 'gamepad' {
  if (engineId !== 'azahar') return 'keyboard';
  return readAzaharMode(path.join(paths.userData, 'azahar'));
}

function engineDirs(
  engineId: string,
  paths: ControlPaths,
  engineDir?: string,
): Partial<Record<'engineDir' | 'configDir' | 'root', string>> {
  switch (engineId) {
    case 'mgba':
      return { engineDir: engineDir ?? path.join(paths.enginesDir, 'mgba') };
    case 'melonds':
      return { engineDir: engineDir ?? path.join(paths.enginesDir, 'melonds') };
    case 'ares':
      return { engineDir: engineDir ?? path.join(paths.enginesDir, 'ares') };
    case 'dolphin':
      return { configDir: path.join(paths.userData, 'dolphin', 'Config') };
    case 'azahar':
      return { root: path.join(paths.userData, 'azahar') };
    case 'cemu':
      return { engineDir: engineDir ?? path.join(paths.enginesDir, 'cemu') };
    case 'pcsx2':
      return { root: path.join(paths.userData, 'playstation', 'PCSX2') };
    case 'swanstation':
      return { engineDir: engineDir ?? path.join(paths.enginesDir, 'swanstation') };
    default:
      return {};
  }
}

export function applyEngineControls(
  engineId: string,
  paths: ControlPaths,
  bindings: KeyboardBindings,
  force: boolean,
  options: ApplyControlsOptions = {},
): ApplyControlsResult {
  const unsupported: ApplyControlsResult = {
    engineId,
    supported: false,
    applied: false,
    files: [],
    reason: 'unsupported',
  };
  if (!isControlsSupported(engineId)) return unsupported;

  const dirs = engineDirs(engineId, paths, options.engineDir);
  let result: ApplyResult;
  switch (engineId) {
    case 'mgba':
      result = applyMgbaControls(dirs.engineDir!, bindings, force);
      break;
    case 'melonds':
      result = applyMelondsControls(dirs.engineDir!, bindings, force);
      break;
    case 'dolphin':
      result = applyDolphinControls(dirs.configDir!, bindings, force);
      break;
    case 'azahar':
      result = applyAzaharControls(dirs.root!, bindings, options.gamepads ?? 0, force, options.mode);
      break;
    case 'ares':
      result = applyAresControls(dirs.engineDir!, bindings, force);
      break;
    case 'cemu':
      result = applyCemuControls(dirs.engineDir!, bindings, force);
      break;
    case 'swanstation':
      // The libretro host receives the layout through `--keys` at launch; there
      // is no engine-side file to rewrite.
      result = { applied: true, files: [] };
      break;
    case 'pcsx2':
      result = applyPcsx2Controls(dirs.root!, bindings, force);
      break;
    default:
      return unsupported;
  }
  return { engineId, supported: true, ...result };
}

/** Current bindings as read from the engine's own config file, if supported. */
export function readEngineControls(
  engineId: string,
  paths: ControlPaths,
  engineDir?: string,
): KeyboardBindings | null {
  const dirs = engineDirs(engineId, paths, engineDir);
  switch (engineId) {
    case 'mgba':
      return readMgbaControls(dirs.engineDir!);
    case 'melonds':
      return readMelondsControls(dirs.engineDir!);
    case 'dolphin':
      return readDolphinControls(dirs.configDir!);
    case 'azahar':
      return readAzaharControls(dirs.root!);
    case 'ares':
      return readAresControls(dirs.engineDir!);
    case 'cemu':
      return readCemuControls(dirs.engineDir!);
    case 'swanstation':
      return null;
    case 'pcsx2':
      return readPcsx2Controls(dirs.root!);
    default:
      return null;
  }
}
