import { describe, expect, it } from 'vitest';
import { ndsModelConsole } from '../src/shared/systems';
import {
  DSI_BIOS_SIZES,
  MELONDS_DEFAULT_GEOMETRY,
  DSI_NAND_SIZE,
  dsiSizeProblem,
  melondsManagedKeys,
  patchMelondsToml,
  setTomlKey,
  type MelondsConfigOptions,
} from '../src/main/melonds-config';

const dsiPaths = {
  bios7: 'C:\\Nest\\melonds\\dsi\\bios7.bin',
  bios9: 'C:\\Nest\\melonds\\dsi\\bios9.bin',
  firmware: 'C:\\Nest\\melonds\\dsi\\firmware.bin',
  nand: 'C:\\Nest\\melonds\\dsi\\nand.bin',
};

const ndsPaths = {
  bios7: 'C:\\Nest\\melonds\\bios\\bios7.bin',
  bios9: 'C:\\Nest\\melonds\\bios\\bios9.bin',
  firmware: 'C:\\Nest\\melonds\\bios\\firmware.bin',
};
const dsiOptions: MelondsConfigOptions = { console: 'dsi', systemMode: false, paths: dsiPaths, dsPaths: ndsPaths };
const ndsOptions: MelondsConfigOptions = { console: 'nds', systemMode: false, paths: ndsPaths };

describe('melonDS TOML patching', () => {
  it('writes the DSi console switch and dump paths', () => {
    const out = patchMelondsToml('', dsiOptions);
    expect(out).toContain('[Emu]');
    expect(out).toContain('ConsoleType = 1');
    expect(out).toContain('ExternalBIOSEnable = true');
    expect(out).toContain('[DSi]');
    expect(out).toContain('ExternalBIOSEnable = true');
    // Windows paths become forward slashes and stay quoted.
    expect(out).toContain('BIOS7Path = "C:/Nest/melonds/dsi/bios7.bin"');
    // melonDS loads the DS boot ROMs even in DSi mode.
    expect(out).toContain('[DS]');
    expect(out).toContain('BIOS7Path = "C:/Nest/melonds/bios/bios7.bin"');
    expect(out).toContain('NANDPath = "C:/Nest/melonds/dsi/nand.bin"');
    expect(out).not.toContain('\\');
  });

  it('keeps unrelated settings and replaces owned keys in place', () => {
    const stock = [
      '[Emu]',
      'ConsoleType = 0',
      'DirectBoot = true',
      '',
      '[Audio]',
      'Volume = 42',
    ].join('\n');
    const out = patchMelondsToml(stock, dsiOptions);
    expect(out).toContain('Volume = 42');
    expect(out.match(/ConsoleType = /g)).toHaveLength(1);
    expect(out).toContain('ConsoleType = 1');
    expect(out).toContain('DirectBoot = true');
  });

  it('boots the firmware menu when system mode is on', () => {
    const out = patchMelondsToml('', { ...dsiOptions, systemMode: true });
    expect(out).toContain('DirectBoot = false');
    expect(out).toContain('ConsoleType = 1');
  });

  it('switches back to the DS console type', () => {
    const out = patchMelondsToml('', ndsOptions);
    expect(out).toContain('ConsoleType = 0');
    expect(out).toContain('[DS]');
    expect(out).toContain('BIOS7Path = "C:/Nest/melonds/bios/bios7.bin"');
    expect(out).not.toContain('[DSi]');
  });

  it('is idempotent', () => {
    const once = patchMelondsToml('', dsiOptions);
    const twice = patchMelondsToml(once, dsiOptions);
    expect(twice).toBe(once);
  });

  it('creates missing sections and keys', () => {
    const lines: string[] = ['[Instance1]', 'Name = "x"'];
    setTomlKey(lines, 'DSi', 'NANDPath', '"C:/a/b.bin"');
    const text = lines.join('\n');
    expect(text).toContain('[DSi]');
    expect(text).toContain('Name = "x"');
    expect(text).toContain('NANDPath = "C:/a/b.bin"');
  });

  it('writes the 2x window geometry on first launch', () => {
    const out = patchMelondsToml('', { ...ndsOptions, defaultGeometry: MELONDS_DEFAULT_GEOMETRY });
    expect(out).toContain('[Instance0.Window0]');
    expect(out).toContain(`Geometry = "${MELONDS_DEFAULT_GEOMETRY}"`);
    expect(out).toContain('IntegerScaling = 1');
  });

  it('keeps an existing window geometry', () => {
    const existing = '[Instance0.Window0]\nGeometry = "custom"\n';
    const out = patchMelondsToml(existing, ndsOptions);
    expect(out).toContain('Geometry = "custom"');
  });

  it('models every managed key per console', () => {
    const dsiKeys = melondsManagedKeys(dsiOptions).map(([s, k]) => `${s}.${k}`);
    expect(dsiKeys).toContain('Emu.ConsoleType');
    expect(dsiKeys).toContain('DSi.NANDPath');
    const ndsKeys = melondsManagedKeys(ndsOptions).map(([s, k]) => `${s}.${k}`);
    expect(ndsKeys).toContain('DS.BIOS7Path');
    expect(ndsKeys).not.toContain('DSi.NANDPath');
  });
});

describe('DSi dump validation', () => {
  const valid = {
    bios7: DSI_BIOS_SIZES.bios7,
    bios9: DSI_BIOS_SIZES.bios9,
    firmware: DSI_BIOS_SIZES.firmware,
    nand: DSI_NAND_SIZE,
  };

  it('accepts the correct sizes', () => {
    expect(dsiSizeProblem(valid)).toBeNull();
  });

  it('accepts a NAND with the 64 byte nocash footer (melonDS reads it)', () => {
    expect(dsiSizeProblem({ ...valid, nand: DSI_NAND_SIZE + 64 })).toBeNull();
  });

  it('rejects a truncated NAND', () => {
    expect(dsiSizeProblem({ ...valid, nand: DSI_NAND_SIZE - 64 })).toContain('nand.bin');
  });

  it('rejects mismatched BIOS sizes', () => {
    expect(dsiSizeProblem({ ...valid, bios7: 32768 })).toContain('bios7.bin');
    expect(dsiSizeProblem({ ...valid, firmware: 65536 })).toContain('firmware.bin');
  });
});

describe('NDS model mapping', () => {
  it('maps DS/DSL to the DS console and DSi/DSiLL to DSi', () => {
    expect(ndsModelConsole('ds')).toBe('nds');
    expect(ndsModelConsole('dsl')).toBe('nds');
    expect(ndsModelConsole('dsi')).toBe('dsi');
    expect(ndsModelConsole('dsill')).toBe('dsi');
  });

  it('falls back to the original DS', () => {
    expect(ndsModelConsole(undefined)).toBe('nds');
    expect(ndsModelConsole('nope')).toBe('nds');
  });
});
