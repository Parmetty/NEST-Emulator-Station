import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyRpcs3Renderer,
  ensureRpcs3Config,
  readRpcs3Renderer,
  rpcs3CacheDir,
  rpcs3ConfigPath,
} from '../src/main/rpcs3';

async function engineDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'nest-rpcs3-cfg-'));
}

const CONFIG = `[Video]
  Renderer: OpenGL
  Resolution: 1280x720

[Audio]
  Renderer: Cubeb
`;

describe('RPCS3 renderer config', () => {
  it('rewrites only the video renderer, leaving the audio one alone', async () => {
    const dir = await engineDir();
    try {
      await mkdir(path.join(dir, 'config'), { recursive: true });
      await writeFile(rpcs3ConfigPath(dir), CONFIG);

      const result = applyRpcs3Renderer(dir, 'vulkan');
      expect(result.ok).toBe(true);
      expect(result.changed).toBe(true);

      const text = await readFile(rpcs3ConfigPath(dir), 'utf8');
      expect(text).toContain('Renderer: Vulkan');
      expect(text).toContain('Renderer: Cubeb');
      expect(readRpcs3Renderer(dir)).toBe('vulkan');

      const again = applyRpcs3Renderer(dir, 'vulkan');
      expect(again.changed).toBe(false);

      const back = applyRpcs3Renderer(dir, 'opengl');
      expect(back.changed).toBe(true);
      expect(await readFile(rpcs3ConfigPath(dir), 'utf8')).toContain('Renderer: OpenGL');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('never touches precompiled cache files when switching renderer', async () => {
    const dir = await engineDir();
    try {
      await mkdir(path.join(dir, 'config'), { recursive: true });
      await writeFile(rpcs3ConfigPath(dir), CONFIG);
      const cacheGame = path.join(rpcs3CacheDir(dir), 'BLJM61303');
      await mkdir(cacheGame, { recursive: true });
      await writeFile(path.join(cacheGame, 'v9-kusa-test.obj.gz'), 'compiled');

      applyRpcs3Renderer(dir, 'vulkan');
      applyRpcs3Renderer(dir, 'opengl');

      expect(existsSync(path.join(cacheGame, 'v9-kusa-test.obj.gz'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('seeds config.yml from seed/ only when the engine has no config yet', async () => {
    const dir = await engineDir();
    try {
      expect(ensureRpcs3Config(dir)).toBeNull();
      await mkdir(path.join(dir, 'seed'), { recursive: true });
      await writeFile(path.join(dir, 'seed', 'config.yml'), CONFIG);
      const seeded = ensureRpcs3Config(dir);
      expect(seeded).toBe(rpcs3ConfigPath(dir));
      expect(existsSync(rpcs3ConfigPath(dir))).toBe(true);

      await writeFile(rpcs3ConfigPath(dir), CONFIG.replace('OpenGL', 'Vulkan'));
      ensureRpcs3Config(dir);
      expect(await readFile(rpcs3ConfigPath(dir), 'utf8')).toContain('Renderer: Vulkan');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
