/**
 * melonDS can boot the DS/DSi firmware with a cartridge already inserted:
 * `melonDS.exe -b always <rom>`. Nest uses that to make the system menu see a
 * game card instead of an empty Slot-1.
 *
 * The choice lives here (instead of inline in ipc.ts) so the ordering rules are
 * unit-testable: an explicit ROM always wins, then the most recently played NDS
 * title, and nothing when the player turned the feature off.
 */
import type { GameRecord } from '../shared/contract';

export function selectNdsSystemCart(
  games: readonly GameRecord[],
  enabled: boolean,
  explicitRom?: string,
): string | null {
  if (explicitRom) return explicitRom;
  if (!enabled) return null;
  const played = games
    .filter((game) => game.systemId === 'nds')
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
  const newest = played.find((game) => (game.lastPlayed ?? 0) > 0) ?? played[0];
  return newest?.path ?? null;
}
