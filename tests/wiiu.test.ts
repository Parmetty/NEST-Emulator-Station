import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { engineManifestSchema } from '../src/shared/contract';
import { buildArgs } from '../src/main/engines';
import { scanFolder } from '../src/main/scanner';
import {
  applyCemuLaunchOptions,
  cemuKeysPath,
  copyCemuKeys,
  countCemuKeys,
  isValidWiiuMlc,
  WIIU_MENU_TITLE_ID,
} from '../src/main/cemu';

const REPO = path.join(__dirname, '..');

function readCemuManifest(): unknown {
  return JSON.parse(readFileSync(path.join(REPO, 'resources', 'engines', 'cemu.json'), 'utf8'));
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('Wii U scanning', () => {
  it('maps .wua/.wud/.wux (case-insensitive) to wiiu', async () => {
    const root = await tempDir('nest-wiiu-scan-');
    try {
      writeFileSync(path.join(root, 'game.wua'), 'wua-bytes');
      writeFileSync(path.join(root, 'DISC.WUD'), 'wud-bytes');
      writeFileSync(path.join(root, 'archive.WUX'), 'wux-bytes');
      writeFileSync(path.join(root, 'not-a-rom.txt'), 'ignore');
      const files = await scanFolder(root);
      const byName = new Map(files.map((file) => [file.fileName, file.systemId]));
      expect(byName.get('game.wua')).toBe('wiiu');
      expect(byName.get('DISC.WUD')).toBe('wiiu');
      expect(byName.get('archive.WUX')).toBe('wiiu');
      expect(byName.has('not-a-rom.txt')).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('cemu.json manifest', () => {
  it('parses and points at the bundled Cemu', () => {
    const manifest = engineManifestSchema.parse(readCemuManifest());
    expect(manifest.id).toBe('cemu');
    expect(manifest.systems).toEqual(['wiiu']);
    expect(manifest.detect.paths[0]).toBe('{engines}/cemu/Cemu.exe');
    expect(manifest.launch.args).toEqual(['-g', '{rom}']);
    expect(manifest.fullscreenFlag).toBe('-f');
    expect(manifest.captureAspect).toBeCloseTo(16 / 9, 6);
    expect(manifest.capabilities.systemMode).toBe('Wii U Menu');
  });

  it('boots the Wii U Menu by title id', () => {
    const manifest = engineManifestSchema.parse(readCemuManifest());
    expect(manifest.systemArgsBySystem?.wiiu).toEqual(['-t', WIIU_MENU_TITLE_ID]);
  });
});

describe('Cemu keys import', () => {
  it('counts only valid 32-hex lines (comments/blank lines ignored)', () => {
    const text = [
      '# Cemu keys',
      '',
      '0123456789abcdef0123456789abcdef',
      '  fedcba9876543210fedcba9876543210  ',
      'this is not a key',
      '0123456789abcdef0123456789abcdef # trailing comment',
      '0123456789abcdef0123456789abcde', // 31 chars: invalid
      '',
    ].join('\n');
    expect(countCemuKeys(text)).toBe(3);
    expect(countCemuKeys('')).toBe(0);
  });

  it('copies keys.txt into the portable folder and keeps a one-time backup', async () => {
    const enginesDir = await tempDir('nest-cemu-engines-');
    const sourceDir = await tempDir('nest-cemu-keys-');
    try {
      const source = path.join(sourceDir, 'keys.txt');
      writeFileSync(source, '# dumper\n0123456789abcdef0123456789abcdef\n');

      const target = cemuKeysPath(enginesDir);
      const first = copyCemuKeys(source, target);
      expect(first.ok).toBe(true);
      expect(first.keys).toBe(1);
      expect(first.path).toBe(path.join(enginesDir, 'cemu', 'portable', 'keys.txt'));
      expect(readFileSync(target, 'utf8')).toContain('0123456789abcdef0123456789abcdef');

      // Second import: contents replaced, first backup kept.
      writeFileSync(source, '# second\nfedcba9876543210fedcba9876543210\n');
      const second = copyCemuKeys(source, target);
      expect(second.ok).toBe(true);
      expect(second.keys).toBe(1);
      expect(second.backup).toBe(`${target}.before-nest`);
      expect(readFileSync(`${target}.before-nest`, 'utf8')).toContain('0123456789abcdef0123456789abcdef');
      expect(readFileSync(target, 'utf8')).toContain('fedcba9876543210fedcba9876543210');

      // Third import keeps the FIRST backup untouched.
      writeFileSync(source, '00000000000000000000000000000000\n');
      copyCemuKeys(source, target);
      expect(readFileSync(`${target}.before-nest`, 'utf8')).toContain('0123456789abcdef0123456789abcdef');
    } finally {
      await rm(enginesDir, { recursive: true, force: true });
      await rm(sourceDir, { recursive: true, force: true });
    }
  });

  it('rejects a file without any valid key and leaves the target alone', async () => {
    const enginesDir = await tempDir('nest-cemu-bad-');
    const sourceDir = await tempDir('nest-cemu-bad-src-');
    try {
      const source = path.join(sourceDir, 'keys.txt');
      writeFileSync(source, '# only comments\nnot a key\n');
      const target = cemuKeysPath(enginesDir);
      const result = copyCemuKeys(source, target);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('missing-cemu-keys');
      expect(result.keys).toBe(0);
      expect(existsSync(target)).toBe(false);
    } finally {
      await rm(enginesDir, { recursive: true, force: true });
      await rm(sourceDir, { recursive: true, force: true });
    }
  });
});

describe('Wii U MLC validation', () => {
  it('accepts a folder with the Wii U Menu title or a usr tree', async () => {
    const root = await tempDir('nest-mlc-');
    try {
      const withTitle = path.join(root, 'with-title');
      mkdirSync(path.join(withTitle, 'sys', 'title', '00050010', WIIU_MENU_TITLE_ID), { recursive: true });
      expect(isValidWiiuMlc(withTitle)).toBe(true);

      const withUsr = path.join(root, 'with-usr');
      mkdirSync(path.join(withUsr, 'usr'), { recursive: true });
      expect(isValidWiiuMlc(withUsr)).toBe(true);

      const empty = path.join(root, 'empty');
      mkdirSync(empty, { recursive: true });
      expect(isValidWiiuMlc(empty)).toBe(false);
      expect(isValidWiiuMlc(path.join(root, 'missing'))).toBe(false);
      expect(isValidWiiuMlc('')).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('Cemu launch arguments', () => {
  it('inserts -m before -g for games when a valid MLC is configured', async () => {
    const root = await tempDir('nest-cemu-args-');
    try {
      mkdirSync(path.join(root, 'usr'), { recursive: true });
      const game = applyCemuLaunchOptions({ mode: 'game', mlc: root, args: ['-g', 'game.wua'] });
      expect(game.ok).toBe(true);
      expect(game.args).toEqual(['-m', root, '-g', 'game.wua']);

      const sys = applyCemuLaunchOptions({
        mode: 'system',
        mlc: root,
        args: ['-t', WIIU_MENU_TITLE_ID],
      });
      expect(sys.ok).toBe(true);
      expect(sys.args).toEqual(['-m', root, '-t', WIIU_MENU_TITLE_ID]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows game mode without MLC (Cemu falls back to its own path)', () => {
    const result = applyCemuLaunchOptions({ mode: 'game', mlc: null, args: ['-g', 'game.wua'] });
    expect(result).toEqual({ ok: true, args: ['-g', 'game.wua'] });
  });

  it('refuses system mode without MLC with a clear error', () => {
    const result = applyCemuLaunchOptions({
      mode: 'system',
      mlc: null,
      args: ['-t', WIIU_MENU_TITLE_ID],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing-wiiu-mlc');
    expect(result.args).toEqual(['-t', WIIU_MENU_TITLE_ID]);
  });

  it('refuses an invalid MLC directory', async () => {
    const root = await tempDir('nest-cemu-bad-mlc-');
    try {
      const result = applyCemuLaunchOptions({ mode: 'game', mlc: root, args: ['-g', 'game.wua'] });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid-wiiu-mlc');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('produces the final command line from the manifest template', async () => {
    const root = await tempDir('nest-cemu-final-');
    try {
      mkdirSync(path.join(root, 'usr'), { recursive: true });
      const manifest = engineManifestSchema.parse(readCemuManifest());
      const base = buildArgs(manifest.launch.args, { rom: 'E:/roms/game.wua' });
      const result = applyCemuLaunchOptions({ mode: 'game', mlc: root, args: base });
      expect(result.ok).toBe(true);
      expect(result.args).toEqual(['-m', root, '-g', 'E:/roms/game.wua']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
