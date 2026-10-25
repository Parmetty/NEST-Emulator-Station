import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SYSTEMS } from '../shared/systems';

export interface SystemStats {
  games: number;
  saves: number;
  lastPlayed: string | null;
  favorite: boolean;
}

interface LibraryFile {
  version: 1;
  systems: Record<string, SystemStats>;
}

const EMPTY: SystemStats = { games: 0, saves: 0, lastPlayed: null, favorite: false };

/** Demo library so the first launch has something to look at. Replaced by the scanner in P1. */
const SEED: Record<string, Partial<SystemStats>> = {
  fc: { games: 642, saves: 210, lastPlayed: '昨天' },
  sfc: { games: 517, saves: 168, lastPlayed: '3d' },
  n64: { games: 187, saves: 74, lastPlayed: '1w' },
  gba: { games: 128, saves: 36, lastPlayed: '2h' },
  ngc: { games: 94, saves: 52, lastPlayed: '4d' },
  nds: { games: 412, saves: 130, lastPlayed: '1m' },
  wii: { games: 76, saves: 41, lastPlayed: '2w' },
  '3ds': { games: 168, saves: 61, lastPlayed: '3w' },
  wiiu: { games: 41, saves: 18, lastPlayed: null },
};

function seedFile(): LibraryFile {
  const systems: Record<string, SystemStats> = {};
  for (const s of SYSTEMS) {
    if (s.state === 'locked') continue;
    systems[s.id] = { ...EMPTY, ...(SEED[s.id] ?? {}) };
  }
  return { version: 1, systems };
}

/**
 * Tiny JSON store. Deliberately boring: the library is small in P0, and a
 * file we can read in a text editor beats a native sqlite dependency here.
 * The interface stays the same when sqlite lands in P1/P2.
 */
export class Store {
  private data: LibraryFile = { version: 1, systems: {} };
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as LibraryFile;
      if (parsed?.version !== 1 || typeof parsed.systems !== 'object') throw new Error('bad shape');
      this.data = parsed;
    } catch {
      this.data = seedFile();
      await this.save();
    }
  }

  stats(systemId: string): SystemStats {
    return this.data.systems[systemId] ?? { ...EMPTY };
  }

  all(): Record<string, SystemStats> {
    return this.data.systems;
  }

  async setFavorite(systemId: string, favorite: boolean): Promise<SystemStats> {
    const current = this.stats(systemId);
    const next = { ...current, favorite };
    this.data.systems[systemId] = next;
    await this.save();
    return next;
  }

  async recordSession(systemId: string, startedAt: number): Promise<SystemStats> {
    const current = this.stats(systemId);
    const next: SystemStats = { ...current, lastPlayed: new Date(startedAt).toISOString() };
    this.data.systems[systemId] = next;
    await this.save();
    return next;
  }

  /** Serialised atomic write: temp file + rename, so a crash never leaves half a library. */
  private save(): Promise<void> {
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.tmp`;
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }
}
