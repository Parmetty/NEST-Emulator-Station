import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { EngineRegistry, buildArgs, expandPath } from '../src/main/engines';
import { engineManifestSchema } from '../src/shared/contract';
import { SYSTEMS } from '../src/shared/systems';

const ENGINES_DIR = path.join(__dirname, '..', 'resources', 'engines');

describe('engine manifests', () => {
  it('loads every manifest in resources/engines', async () => {
    const registry = new EngineRegistry(ENGINES_DIR);
    await registry.load();
    const ids = registry.list().map((m) => m.id).sort();
    expect(ids).toContain('fake');
    expect(ids.length).toBeGreaterThanOrEqual(10);
    for (const manifest of registry.list()) {
      expect(engineManifestSchema.safeParse(manifest).success).toBe(true);
    }
  });

  it('covers every playable system with an engine', async () => {
    const registry = new EngineRegistry(ENGINES_DIR);
    await registry.load();
    const covered = new Set(registry.list().flatMap((m) => m.systems));
    for (const system of SYSTEMS) {
      expect(covered.has(system.id), `no engine for ${system.id}`).toBe(true);
    }
  });

  it('every system points at an existing manifest', async () => {
    const registry = new EngineRegistry(ENGINES_DIR);
    await registry.load();
    for (const system of SYSTEMS) {
      expect(registry.get(system.engine), `${system.id} -> ${system.engine}`).toBeDefined();
    }
  });
});

describe('argument building', () => {
  it('substitutes placeholders without touching unknown ones', () => {
    expect(buildArgs(['-f', '{rom}'], { rom: 'a.gba' })).toEqual(['-f', 'a.gba']);
    expect(buildArgs(['{missing}'], {})).toEqual(['{missing}']);
  });

  it('expands windows style env placeholders', () => {
    expect(expandPath('%PROGRAMFILES%/mGBA/mGBA.exe', { PROGRAMFILES: 'C:/Program Files' })).toBe(
      'C:/Program Files/mGBA/mGBA.exe',
    );
  });

  it('leaves unknown placeholders alone so a bad manifest is visible', () => {
    expect(expandPath('%NOPE%/x', {})).toBe('%NOPE%/x');
  });
});
