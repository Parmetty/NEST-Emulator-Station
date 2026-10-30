import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { engineManifestSchema } from '../src/shared/contract';
import { buildArgs } from '../src/main/engines';
import {
  findWiiMenuWad,
  hostKeyToken,
  hostKeysSpec,
  hostWiiMenuWad,
  libretroAvailability,
  libretroCorePath,
  libretroHostPath,
  libretroSaveDir,
  libretroShotDir,
  libretroSysDir,
  listShotCandidates,
  stageLibretroRuntime,
} from '../src/main/libretro';

const REPO = path.join(__dirname, '..');

function readManifest(): unknown {
  return JSON.parse(readFileSync(path.join(REPO, 'resources', 'engines', 'dolphin-lr.json'), 'utf8'));
}

function readDolphinManifest(): unknown {
  return JSON.parse(readFileSync(path.join(REPO, 'resources', 'engines', 'dolphin.json'), 'utf8'));
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('dolphin-lr manifest', () => {
  it('parses with the engine schema and targets the libretro host', () => {
    const parsed = engineManifestSchema.safeParse(readManifest());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const manifest = parsed.data;
    expect(manifest.id).toBe('dolphin-lr');
    expect(manifest.kind).toBe('native');
    expect(manifest.systems).toEqual(['ngc', 'wii']);
    expect(manifest.detect.paths[0]).toContain('nest-libretro.exe');
    expect(manifest.launch.fullscreenFlag).toBe('--fullscreen');
  });

  it('passes the core, runtime dirs and shot flags for direct play', () => {
    const manifest = engineManifestSchema.parse(readManifest());
    const args = manifest.launch.args.join(' ');
    expect(args).toContain('--core {engines}/dolphin/dolphin_libretro.dll');
    expect(args).toContain('--rom {rom}');
    expect(args).toContain('--system-dir {userData}/libretro/sys');
    expect(args).toContain('--save-dir {userData}/libretro/save');
    expect(args).toContain('--shot-dir {userData}/covers-pending');
    expect(args).toContain('--shot-every 120');
    expect(args).toContain('--timeout 0');

    const built = buildArgs(manifest.launch.args, {
      engines: 'E:/nest/resources/engines',
      userData: 'E:/nest/.profile',
      rom: 'E:/roms/game.gcm',
    });
    expect(built.join(' ')).not.toContain('{');
    expect(built).toContain('E:/nest/resources/engines/dolphin/dolphin_libretro.dll');
    expect(built).toContain('E:/nest/.profile/covers-pending');
  });

  it('boots the Wii Menu from the WAD and never asks the core for a no-game boot', () => {
    const manifest = engineManifestSchema.parse(readManifest());
    const wii = manifest.systemArgsBySystem?.wii?.join(' ') ?? '';
    expect(wii).toContain('--rom {userData}/firmware/wii/wii-menu.wad');
    expect(wii).toContain('--system-dir {userData}/libretro/sys');
    expect(wii).toContain('--timeout 0');

    // Dolphin's libretro core crashes on content-free boot, so the GC menu must
    // keep using Dolphin Qt + UIA (docs/PLAN-LIBRETRO.md).
    expect(manifest.systemArgsBySystem?.ngc).toBeUndefined();
  });

  it('resolves the host exe from resources/tools via the existing placeholder', () => {
    const manifest = engineManifestSchema.parse(readManifest());
    const enginesDir = path.join(REPO, 'resources', 'engines');
    const expanded = manifest.detect.paths[0].replace(/\{engines\}/g, enginesDir);
    const resolved = path.normalize(expanded);
    expect(resolved.endsWith(path.join('resources', 'tools', 'nest-libretro.exe'))).toBe(true);
    expect(existsSync(resolved)).toBe(existsSync(libretroHostPath(path.join(REPO, 'resources', 'tools'))));
  });
});

describe('libretro availability and paths', () => {
  it('needs both the host exe and the core DLL', async () => {
    const root = await tempDir('nest-lr-avail-');
    try {
      const toolsDir = path.join(root, 'tools');
      const enginesDir = path.join(root, 'engines');
      mkdirSync(toolsDir, { recursive: true });
      mkdirSync(path.join(enginesDir, 'dolphin'), { recursive: true });
      expect(libretroAvailability({ toolsDir, enginesDir, userData: root }).available).toBe(false);

      writeFileSync(libretroHostPath(toolsDir), 'exe');
      expect(libretroAvailability({ toolsDir, enginesDir, userData: root }).available).toBe(false);

      writeFileSync(libretroCorePath(enginesDir), 'dll');
      const availability = libretroAvailability({ toolsDir, enginesDir, userData: root });
      expect(availability.available).toBe(true);
      expect(availability.host).toBe(libretroHostPath(toolsDir));
      expect(availability.core).toBe(libretroCorePath(enginesDir));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('derives the runtime folders from userData', () => {
    expect(libretroSysDir('C:/data')).toBe(path.join('C:/data', 'libretro', 'sys'));
    expect(libretroSaveDir('C:/data')).toBe(path.join('C:/data', 'libretro', 'save'));
    expect(libretroShotDir('C:/data')).toBe(path.join('C:/data', 'covers-pending'));
  });
});

describe('libretro staging', () => {
  async function fixture(): Promise<{ root: string; enginesDir: string; toolsDir: string; userData: string }> {
    const root = await tempDir('nest-lr-stage-');
    const enginesDir = path.join(root, 'engines');
    const toolsDir = path.join(root, 'tools');
    const userData = path.join(root, 'userData');
    mkdirSync(toolsDir, { recursive: true });
    mkdirSync(path.join(enginesDir, 'dolphin', 'Sys', 'Resources'), { recursive: true });
    mkdirSync(path.join(enginesDir, 'dolphin', 'Licenses'), { recursive: true });
    writeFileSync(path.join(enginesDir, 'dolphin', 'Sys', 'Resources', 'osd.png'), 'png');
    writeFileSync(path.join(enginesDir, 'dolphin', 'Licenses', 'COPYING'), 'gpl');
    writeFileSync(libretroHostPath(toolsDir), 'exe');
    writeFileSync(libretroCorePath(enginesDir), 'dll');
    mkdirSync(path.join(userData, 'dolphin', 'GC', 'USA'), { recursive: true });
    writeFileSync(path.join(userData, 'dolphin', 'wii-menu.wad'), 'wad-bytes');
    writeFileSync(path.join(userData, 'dolphin', 'GC', 'USA', 'IPL.bin'), 'ipl-bytes');
    return { root, enginesDir, toolsDir, userData };
  }

  it('copies Sys, the Wii WAD and the GC IPL into the core folders', async () => {
    const { root, enginesDir, toolsDir, userData } = await fixture();
    try {
      const result = stageLibretroRuntime({ toolsDir, enginesDir, userData });
      expect(result.ok).toBe(true);
      expect(result.sysReady).toBe(true);
      expect(result.errors).toEqual([]);

      const sys = path.join(libretroSysDir(userData), 'dolphin-emu', 'Sys', 'Resources', 'osd.png');
      expect(existsSync(sys)).toBe(true);
      expect(existsSync(path.join(libretroSysDir(userData), 'dolphin-emu', 'Licenses', 'COPYING'))).toBe(true);

      expect(findWiiMenuWad(userData)).toBe(hostWiiMenuWad(userData));
      expect(await readFile(hostWiiMenuWad(userData), 'utf8')).toBe('wad-bytes');

      const ipl = path.join(libretroSaveDir(userData), 'User', 'GC', 'USA', 'IPL.bin');
      expect(await readFile(ipl, 'utf8')).toBe('ipl-bytes');
      expect(result.staged.length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is idempotent (marker stops re-copying the Sys tree)', async () => {
    const { root, enginesDir, toolsDir, userData } = await fixture();
    try {
      stageLibretroRuntime({ toolsDir, enginesDir, userData });
      const second = stageLibretroRuntime({ toolsDir, enginesDir, userData });
      expect(second.ok).toBe(true);
      expect(second.staged).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses to report ready when Dolphin Sys is missing', async () => {
    const { root, enginesDir, toolsDir, userData } = await fixture();
    try {
      await rm(path.join(enginesDir, 'dolphin', 'Sys'), { recursive: true, force: true });
      const result = stageLibretroRuntime({ toolsDir, enginesDir, userData });
      expect(result.ok).toBe(false);
      expect(result.sysReady).toBe(false);
      expect(result.errors).toContain('missing-dolphin-sys');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('lists host frames newest first and ignores non-PNG files', async () => {
    const root = await tempDir('nest-lr-shots-');
    try {
      const dir = path.join(root, 'covers-pending');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'old.png'), 'a');
      writeFileSync(path.join(dir, 'new.png'), 'b');
      writeFileSync(path.join(dir, 'notes.txt'), 'c');
      utimesSync(path.join(dir, 'old.png'), new Date(1000), new Date(1000));
      utimesSync(path.join(dir, 'new.png'), new Date(2000), new Date(2000));
      const shots = listShotCandidates(dir);
      expect(shots.map((shot) => path.basename(shot.path))).toEqual(['new.png', 'old.png']);
      expect(shots[0].mtimeMs).toBeGreaterThan(shots[1].mtimeMs);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('libretro host key mapping', () => {
  it('converts KeyboardEvent.code to host key tokens', () => {
    expect(hostKeyToken('KeyJ')).toBe('J');
    expect(hostKeyToken('Digit1')).toBe('1');
    expect(hostKeyToken('F12')).toBe('F12');
    expect(hostKeyToken('Space')).toBe('SPACE');
    expect(hostKeyToken('Enter')).toBe('ENTER');
    expect(hostKeyToken('ShiftRight')).toBe('RSHIFT');
    expect(hostKeyToken('ArrowUp')).toBe('UP');
    expect(hostKeyToken('Numpad1')).toBeNull();
    expect(hostKeyToken('Minus')).toBeNull();
  });

  it('maps GameCube overrides onto host actions (stick axes stay separate)', () => {
    const spec = hostKeysSpec('ngc', {
      a: 'KeyX',
      start: 'Enter',
      select: 'ShiftRight',
      up: 'ArrowUp',
    });
    expect(spec).toBe('A=X,START=ENTER,SELECT=RSHIFT,LY=UP');
  });

  it('maps Wii remote overrides onto +/−/1/2/d-pad', () => {
    const spec = hostKeysSpec('wii', {
      a: 'KeyJ',
      x: 'Digit1',
      start: 'Enter',
      select: 'ShiftRight',
    });
    expect(spec).toBe('A=J,X=1,PLUS=ENTER,MINUS=RSHIFT');
  });

  it('emits nothing when the player kept the host defaults', () => {
    expect(hostKeysSpec('ngc', undefined)).toBeNull();
    expect(hostKeysSpec('ngc', {})).toBeNull();
    expect(hostKeysSpec('ngc', { up: 'Numpad1' })).toBeNull();
  });
});

describe('Qt fallback removal guards', () => {
  it('Dolphin Qt no longer carries a Wii system-menu argument set (libretro only)', () => {
    const manifest = engineManifestSchema.parse(readDolphinManifest());
    expect(manifest.systemArgsBySystem?.wii).toBeUndefined();
    // NGC still uses Dolphin Qt + UIA, so its systemBoot path must stay.
    expect(manifest.systemBoot?.menu).toBe('GameCube');
  });

  it('the libretro manifest only claims the Wii system menu it can actually boot', () => {
    const manifest = engineManifestSchema.parse(readManifest());
    expect(manifest.systemArgsBySystem?.wii).toBeDefined();
    expect(manifest.systemArgsBySystem?.ngc).toBeUndefined();
    expect(manifest.capabilities.systemMode).toContain('Wii Menu');
  });
});
