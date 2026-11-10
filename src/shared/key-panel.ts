/**
 * Engine families decide which console chips the key panel shows and which
 * console it falls back to when the settings tab changes.
 *
 * This lives outside App.tsx so the "xemu counts as Xbox" rule is shared by the
 * tab switcher and the chip filter instead of being duplicated (a stale copy is
 * what made the panel keep showing xemu after switching to Nintendo).
 */

export type EngineFamily = 'playstation' | 'xbox' | 'nintendo';
export type KeyPanelTab = 'nest' | 'nintendo' | 'playstation' | 'xbox';

export function isPlaystationEngine(engine: string): boolean {
  return engine === 'swanstation' || engine === 'pcsx2' || engine === 'ppsspp' || engine === 'rpcs3';
}

export function isXboxEngine(engine: string): boolean {
  return engine === 'xenia' || engine === 'xemu';
}

export function engineFamily(engine: string): EngineFamily {
  if (isPlaystationEngine(engine)) return 'playstation';
  if (isXboxEngine(engine)) return 'xbox';
  return 'nintendo';
}

/**
 * Console chip the key panel should switch to when the settings tab changes,
 * or null when the current engine already belongs to that tab.
 */
export function keyPanelTargetForTab(tab: KeyPanelTab, currentEngine: string): string | null {
  const family = engineFamily(currentEngine);
  if (tab === 'playstation') return family === 'playstation' ? null : 'ps1';
  if (tab === 'xbox') return family === 'xbox' ? null : 'xbox360';
  if (tab === 'nintendo') return family === 'nintendo' ? null : 'gba';
  return null;
}
