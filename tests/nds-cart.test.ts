import { describe, expect, it } from 'vitest';
import type { GameRecord } from '../src/shared/contract';
import { selectNdsSystemCart } from '../src/main/nds-cart';

function game(path: string, lastPlayed: number | null, systemId = 'nds'): GameRecord {
  return {
    id: path,
    systemId,
    path,
    fileName: path.split('/').pop() ?? path,
    title: path,
    size: 1,
    sha1: 'x',
    addedAt: 1,
    lastPlayed,
  };
}

describe('NDS system-mode cart selection', () => {
  const games = [
    game('D:/roms/old.nds', 100),
    game('D:/roms/new.nds', 300),
    game('D:/roms/never.nds', null),
    game('D:/roms/gba.gba', 999, 'gba'),
  ];

  it('uses an explicit ROM when the caller passed one', () => {
    expect(selectNdsSystemCart(games, false, 'D:/roms/explicit.nds')).toBe(
      'D:/roms/explicit.nds',
    );
  });

  it('returns null when the feature is disabled', () => {
    expect(selectNdsSystemCart(games, false)).toBeNull();
  });

  it('picks the most recently played NDS title', () => {
    expect(selectNdsSystemCart(games, true)).toBe('D:/roms/new.nds');
  });

  it('falls back to the first title when nothing was played yet', () => {
    expect(
      selectNdsSystemCart([game('D:/roms/a.nds', null), game('D:/roms/b.nds', null)], true),
    ).toBe('D:/roms/a.nds');
  });

  it('ignores other systems and empty libraries', () => {
    expect(selectNdsSystemCart([game('D:/roms/gba.gba', 999, 'gba')], true)).toBeNull();
    expect(selectNdsSystemCart([], true)).toBeNull();
  });
});
