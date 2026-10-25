import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { GameRecord, Settings } from '../shared/contract';
import { SYSTEMS } from '../shared/systems';
import type { ScannedFile } from './scanner';

export interface SystemStats {
  games: number;
  saves: number;
  lastPlayed: string | null;
  favorite: boolean;
}

interface LibraryFile {
  version: 2;
  systems: Record<string, SystemStats>;
  games: GameRecord[];
  settings: Settings;
}

const EMPTY: SystemStats = { games: 0, saves: 0, lastPlayed: null, favorite: false };

export const DEFAULT_SETTINGS: Settings = {
  minimizeOnLaunch: true,
  fullscreen: false,
};

/** Demo numbers so an empty library still looks alive. Real scans override them. */
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
  for (const system of SYSTEMS) {
    if (system.state === 'locked') continue;
    systems[system.id] = { ...EMPTY, ...(SEED[system.id] ?? {}) };
  }
  return { version: 2, systems, games: [], settings: { ...DEFAULT_SETTINGS } };
}

/**
 * Tiny JSON store, written atomically. Small enough for P1; the interface is
 * what matters, so a sqlite implementation can drop in later.
 */
export class Store {
  private data: LibraryFile = {
    version: 2,
    systems: {},
    games: [],
    settings: { ...DEFAULT_SETTINGS },
  };
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LibraryFile> & { version?: number };
      if (!parsed?.systems || typeof parsed.systems !== 'object') throw new Error('bad shape');
      this.data = {
        version: 2,
        systems: parsed.systems as Record<string, SystemStats>,
        games: Array.isArray(parsed.games) ? (parsed.games as GameRecord[]) : [],
        settings: { ...DEFAULT_SETTINGS, ...((parsed as { settings?: Partial<Settings> }).settings ?? {}) },
      };
      if (parsed.version !== 2) await this.save();
    } catch {
      this.data = seedFile();
      await this.save();
    }
  }

  stats(systemId: string): SystemStats {
    return this.data.systems[systemId] ?? { ...EMPTY };
  }

  getSettings(): Settings {
    return { ...this.data.settings };
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    this.data.settings = { ...this.data.settings, ...patch };
    await this.save();
    return this.getSettings();
  }

  /** Scanned games, newest first. */
  games(systemId?: string): GameRecord[] {
    const list = systemId ? this.data.games.filter((g) => g.systemId === systemId) : this.data.games;
    return [...list].sort((a, b) => b.addedAt - a.addedAt);
  }

  gameCount(systemId: string): number {
    return this.data.games.reduce((n, g) => n + (g.systemId === systemId ? 1 : 0), 0);
  }

  findGame(gameId: string): GameRecord | undefined {
    return this.data.games.find((g) => g.id === gameId);
  }

  async upsertGames(files: ScannedFile[]): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;
    const byId = new Map(this.data.games.map((g) => [g.id, g]));
    for (const file of files) {
      const id = file.sha1.slice(0, 16);
      if (byId.has(id)) {
        skipped += 1;
        continue;
      }
      const record: GameRecord = {
        id,
        systemId: file.systemId,
        path: file.path,
        fileName: file.fileName,
        title: file.title,
        size: file.size,
        sha1: file.sha1,
        addedAt: Date.now(),
        lastPlayed: null,
      };
      byId.set(id, record);
      added += 1;
    }
    if (added > 0) {
      this.data.games = [...byId.values()];
      await this.save();
    }
    return { added, skipped };
  }

  async setFavorite(systemId: string, favorite: boolean): Promise<SystemStats> {
    const next = { ...this.stats(systemId), favorite };
    this.data.systems[systemId] = next;
    await this.save();
    return next;
  }

  async recordSession(systemId: string, startedAt: number, gameId?: string): Promise<SystemStats> {
    const next: SystemStats = {
      ...this.stats(systemId),
      lastPlayed: new Date(startedAt).toISOString(),
    };
    this.data.systems[systemId] = next;
    if (gameId) {
      const game = this.data.games.find((g) => g.id === gameId);
      if (game) game.lastPlayed = startedAt;
    }
    await this.save();
    return next;
  }

  /** Temp file + rename: a crash never leaves half a library on disk. */
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
