import { describe, expect, it } from 'vitest';
import {
  engineFamily,
  isPlaystationEngine,
  isXboxEngine,
  keyPanelTargetForTab,
} from '../src/shared/key-panel';

describe('key panel engine families', () => {
  it('counts xemu as Xbox, not as an unknown engine', () => {
    expect(isXboxEngine('xemu')).toBe(true);
    expect(isXboxEngine('xenia')).toBe(true);
    expect(isXboxEngine('mgba')).toBe(false);
    expect(engineFamily('xemu')).toBe('xbox');
    expect(engineFamily('rpcs3')).toBe('playstation');
    expect(engineFamily('mgba')).toBe('nintendo');
  });

  it('resets the key panel when the settings tab changes', () => {
    // Regression: switching Xbox -> Nintendo used to keep the xemu panel,
    // because the tab switcher only knew xenia as an Xbox engine.
    expect(keyPanelTargetForTab('nintendo', 'xemu')).toBe('gba');
    expect(keyPanelTargetForTab('nintendo', 'xenia')).toBe('gba');
    expect(keyPanelTargetForTab('nintendo', 'mgba')).toBeNull();
    expect(keyPanelTargetForTab('xbox', 'mgba')).toBe('xbox360');
    expect(keyPanelTargetForTab('xbox', 'xemu')).toBeNull();
    expect(keyPanelTargetForTab('playstation', 'xemu')).toBe('ps1');
    expect(keyPanelTargetForTab('playstation', 'rpcs3')).toBeNull();
    expect(keyPanelTargetForTab('nest', 'xemu')).toBeNull();
  });

  it('treats the PlayStation engines as one family', () => {
    for (const engine of ['swanstation', 'pcsx2', 'ppsspp', 'rpcs3']) {
      expect(isPlaystationEngine(engine)).toBe(true);
    }
    expect(isPlaystationEngine('xemu')).toBe(false);
  });
});
