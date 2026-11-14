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
  /** Paths the player removed from the library; auto-scan must not add them back. */
  hidden: string[];
}

const EMPTY: SystemStats = { games: 0, saves: 0, lastPlayed: null, favorite: false };

export const DEFAULT_SETTINGS: Settings = {
  minimizeOnLaunch: true,
  fullscreen: false,
  autoScan: true,
  scanRoots: [],
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
  return { version: 2, systems, games: [], settings: { ...DEFAULT_SETTINGS }, hidden: [] };
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
    hidden: [],
  };
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      // A BOM (PowerShell's `utf8`, some editors) used to make JSON.parse throw,
      // which silently reseeded the library and dropped every game.
      const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
      const parsed = JSON.parse(text) as Partial<LibraryFile> & { version?: number };
      if (!parsed?.systems || typeof parsed.systems !== 'object') throw new Error('bad shape');
      this.data = {
        version: 2,
        systems: parsed.systems as Record<string, SystemStats>,
        games: Array.isArray(parsed.games) ? (parsed.games as GameRecord[]) : [],
        settings: { ...DEFAULT_SETTINGS, ...((parsed as { settings?: Partial<Settings> }).settings ?? {}) },
        hidden: Array.isArray((parsed as { hidden?: unknown }).hidden)
          ? ((parsed as { hidden: unknown[] }).hidden.filter((v): v is string => typeof v === 'string'))
          : [],
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

  async updateGame(gameId: string, patch: Partial<GameRecord>): Promise<GameRecord | undefined> {
    const index = this.data.games.findIndex((g) => g.id === gameId);
    if (index < 0) return undefined;
    this.data.games[index] = { ...this.data.games[index], ...patch };
    await this.save();
    return this.data.games[index];
  }

  /** Windows paths are case-insensitive; the hidden list compares normalised keys. */
  static pathKey(file: string): string {
    return file.replace(/\\/g, '/').toLowerCase();
  }

  /** Paths the player removed; auto-scan skips them until they hit "全部恢复". */
  hiddenGames(): string[] {
    return [...this.data.hidden];
  }

  async clearHidden(): Promise<number> {
    const count = this.data.hidden.length;
    if (count === 0) return 0;
    this.data.hidden = [];
    await this.save();
    return count;
  }

  /** Existing games keyed by path, so a rescan can reuse their hashes. */
  knownIds(): Map<string, { size: number; sha1: string }> {
    const map = new Map<string, { size: number; sha1: string }>();
    for (const game of this.data.games) map.set(Store.pathKey(game.path), { size: game.size, sha1: game.sha1 });
    return map;
  }

  /** Removes the library entry. The ROM file on disk is never touched. */
  async removeGame(gameId: string): Promise<boolean> {
    const record = this.data.games.find((g) => g.id === gameId);
    if (!record) return false;
    this.data.games = this.data.games.filter((g) => g.id !== gameId);
    const key = Store.pathKey(record.path);
    if (!this.data.hidden.includes(key)) this.data.hidden.push(key);
    await this.save();
    return true;
  }

  async upsertGames(files: ScannedFile[]): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;
    let changed = false;
    const byId = new Map(this.data.games.map((g) => [g.id, g]));
    const byPath = new Map(this.data.games.map((g) => [Store.pathKey(g.path), g]));
    const hidden = new Set(this.data.hidden);
    for (const file of files) {
      const key = Store.pathKey(file.path);
      if (hidden.has(key)) {
        skipped += 1;
        continue;
      }
      const id = file.sha1.slice(0, 16);
      // Match by id first, then by path: switching a big file from full SHA-1 to
      // the fast head/tail fingerprint must update the existing entry in place
      // (and keep its cover) instead of adding a duplicate.
      const existing = byId.get(id) ?? byPath.get(key);
      if (existing) {
        if (existing.sha1 !== file.sha1) {
          existing.sha1 = file.sha1;
          changed = true;
        }
        if (existing.size !== file.size) {
          existing.size = file.size;
          changed = true;
        }
        if (existing.path !== file.path) {
          existing.path = file.path;
          changed = true;
        }
        byId.set(id, existing);
        byPath.set(key, existing);
        // Older GOD scans used the Title ID (e.g. 4D530AA4) as the title. A
        // fresh scan can recover the real title from the STFS header; only
        // replace ID-like placeholders, never a name the user chose.
        if (file.title && file.title !== existing.title && /^[0-9A-F]{8}$/i.test(existing.title)) {
          existing.title = file.title;
          changed = true;
        }
        if (file.region && file.region !== existing.region) {
          existing.region = file.region;
          changed = true;
        }
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
        cover: null,
        coverAt: null,
        region: file.region ?? null,
      };
      byId.set(id, record);
      byPath.set(key, record);
      added += 1;
    }
    if (added > 0 || changed) {
      // A path match keeps the old id, so byId can hold two keys for one object.
      this.data.games = [...new Set(byId.values())];
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
