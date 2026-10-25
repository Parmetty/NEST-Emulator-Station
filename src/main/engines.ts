import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { engineManifestSchema, type EngineManifest, type EngineStatus } from '../shared/contract';

/** Expand %PROGRAMFILES% style placeholders so manifests stay readable. */
export function expandPath(input: string, env: NodeJS.ProcessEnv = process.env): string {
  return input.replace(/%([A-Za-z0-9_]+)%/g, (whole, name: string) => env[name] ?? env[name.toUpperCase()] ?? whole);
}

/** Replace {rom} / {system} style placeholders in an argument template. */
export function buildArgs(template: readonly string[], vars: Record<string, string>): string[] {
  return template.map((arg) => arg.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole));
}

/**
 * Loads engine manifests from a folder. Data, not code: adding a console means
 * dropping a JSON file next to the others.
 */
export class EngineRegistry {
  private readonly manifests = new Map<string, EngineManifest>();

  constructor(private readonly dir: string) {}

  async load(): Promise<void> {
    this.manifests.clear();
    let files: string[] = [];
    try {
      files = (await readdir(this.dir)).filter((f) => f.endsWith('.json'));
    } catch {
      return;
    }
    for (const file of files) {
      const full = path.join(this.dir, file);
      try {
        const raw = JSON.parse(await readFile(full, 'utf8'));
        const parsed = engineManifestSchema.safeParse(raw);
        if (!parsed.success) {
          console.warn(`[engines] invalid manifest ${file}:`, parsed.error.issues[0]?.message);
          continue;
        }
        this.manifests.set(parsed.data.id, parsed.data);
      } catch (err) {
        console.warn(`[engines] cannot read ${file}:`, (err as Error).message);
      }
    }
  }

  get(id: string): EngineManifest | undefined {
    return this.manifests.get(id);
  }

  list(): EngineManifest[] {
    return [...this.manifests.values()];
  }

  /** First existing path wins. `{engines}` resolves to this registry's folder. */
  detect(manifest: EngineManifest): string | null {
    if (manifest.detect.paths.length === 0) return null;
    for (const candidate of manifest.detect.paths) {
      const expanded = expandPath(candidate).replace(/\{engines\}/g, this.dir);
      if (existsSync(expanded)) return expanded;
    }
    return null;
  }

  statuses(): EngineStatus[] {
    return this.list()
      .map((m) => ({
        id: m.id,
        name: m.name,
        systems: m.systems,
        detected: m.detect.paths.length === 0 || this.detect(m) !== null,
        path: this.detect(m),
        systemMode: m.capabilities.systemMode,
        homepage: m.download?.homepage ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
