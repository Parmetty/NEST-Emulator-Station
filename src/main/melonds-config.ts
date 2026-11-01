/**
 * melonDS `melonDS.toml` editing.
 *
 * melonDS keeps its settings in a TOML file next to the executable; Nest only
 * manages the handful of keys that decide which console is emulated and where
 * the user's firmware dumps live. Everything else is left untouched, so the
 * player's own configuration survives.
 *
 * Pure functions only (no Electron / fs) so the behaviour can be unit tested.
 */

export type MelondsConsole = 'nds' | 'dsi';

export interface MelondsFirmwarePaths {
  /** DS BIOS7 (`DS.BIOS7Path`) or DSi BIOS7 (`DSi.BIOS7Path`). */
  bios7: string;
  bios9: string;
  firmware: string;
  /** Only used in DSi mode. */
  nand?: string;
}

export interface MelondsConfigOptions {
  console: MelondsConsole;
  /** `true` when booting the firmware menu instead of a ROM. */
  systemMode: boolean;
  /** `null` when the dumps are missing (caller should abort the launch). */
  paths: MelondsFirmwarePaths | null;
  /**
   * DSi mode still needs the DS boot ROMs (melonDS loads them while bringing up
   * the console), so the DS paths are written alongside the DSi ones.
   */
  dsPaths?: MelondsFirmwarePaths | null;
  /** Set when the config has no window geometry yet (first launch). */
  defaultGeometry?: string | null;
}

/** Sizes melonDS expects for the DSi dumps. */
export const DSI_BIOS_SIZES = { bios7: 65536, bios9: 65536, firmware: 131072 } as const;
/**
 * Default emulator window (2x the DS screen, 512x768 client area). melonDS only
 * honours a saved QWidget geometry blob, so this is the base64 blob captured
 * from a 2x window; it is written only when the config has no geometry yet, and
 * melonDS then persists whatever size the player picks.
 */
export const MELONDS_DEFAULT_GEOMETRY =
  'AdnQywADAAAAAAB/AAAAPAAAAoAAAANbAAAAfwAAAFoAAAKAAAADWwAAAAAAAAAABgAAAAB/AAAAWgAAAoAAAANb';
/** Raw DSi NAND content (256 MiB). A valid image may also carry a 64-byte footer. */
export const DSI_NAND_SIZE = 0xf000000;
/** Size of the nocash footer ("DSi eMMC CID/CPU" + CID + console id). */
export const DSI_NAND_FOOTER = 0x40;

export type TomlKey = [section: string, key: string, rawValue: string];

export interface DsiDumpSizes {
  bios7: number;
  bios9: number;
  firmware: number;
  nand: number;
}

/** Returns a human readable problem, or null when the four dumps look right. */
export function dsiSizeProblem(sizes: DsiDumpSizes): string | null {
  const check = (actual: number, expected: number, label: string): string | null =>
    actual === expected ? null : `${label} 大小异常（${actual} 字节，应为 ${expected}）`;
  // melonDS reads the nocash footer from the end of the file (or from the
  // backup copy at 0xFF800), so both the trimmed and the footer-preserving
  // dumps are accepted. Trimming is not required and must not be done.
  const nandOk = sizes.nand === DSI_NAND_SIZE || sizes.nand === DSI_NAND_SIZE + DSI_NAND_FOOTER;
  return (
    check(sizes.bios7, DSI_BIOS_SIZES.bios7, 'bios7.bin') ??
    check(sizes.bios9, DSI_BIOS_SIZES.bios9, 'bios9.bin') ??
    check(sizes.firmware, DSI_BIOS_SIZES.firmware, 'firmware.bin') ??
    (nandOk ? null : `nand.bin 大小异常（${sizes.nand} 字节，应为 0xF000000 或 0xF000040）`)
  );
}

/** Keys Nest owns; everything else in the file is preserved. */
export function melondsManagedKeys(options: MelondsConfigOptions): TomlKey[] {
  const { console: which, systemMode, paths } = options;
  const managed: TomlKey[] = [];

  if (which === 'dsi') {
    // DSi mode needs the DSi boot ROMs and the NAND image; the DS section stays
    // untouched so switching back to NDS does not lose the user's paths.
    managed.push(['Emu', 'ConsoleType', '1']);
    managed.push(['Emu', 'ExternalBIOSEnable', 'true']);
    managed.push(['Emu', 'DirectBoot', systemMode ? 'false' : 'true']);
    managed.push(['DSi', 'ExternalBIOSEnable', 'true']);
  } else {
    managed.push(['Emu', 'ConsoleType', '0']);
    managed.push(['Emu', 'ExternalBIOSEnable', systemMode ? 'true' : 'false']);
    managed.push(['Emu', 'DirectBoot', systemMode ? 'false' : 'true']);
  }

  // Bigger default window (melonDS restores SizeHint from the geometry blob).
  if (options.defaultGeometry) {
    managed.push(['Instance0.Window0', 'Geometry', `"${options.defaultGeometry}"`]);
  }
  managed.push(['Instance0.Window0', 'IntegerScaling', '1']);

  if (!paths) return managed;

  const posix = (value: string) => value.replace(/\\/g, '/');
  const quoted = (value: string) => `"${posix(value)}"`;

  if (which === 'dsi') {
    if (options.dsPaths) {
      managed.push(['DS', 'BIOS7Path', quoted(options.dsPaths.bios7)]);
      managed.push(['DS', 'BIOS9Path', quoted(options.dsPaths.bios9)]);
      managed.push(['DS', 'FirmwarePath', quoted(options.dsPaths.firmware)]);
    }
    managed.push(['DSi', 'BIOS7Path', quoted(paths.bios7)]);
    managed.push(['DSi', 'BIOS9Path', quoted(paths.bios9)]);
    managed.push(['DSi', 'FirmwarePath', quoted(paths.firmware)]);
    if (paths.nand) managed.push(['DSi', 'NANDPath', quoted(paths.nand)]);
  } else {
    managed.push(['DS', 'BIOS7Path', quoted(paths.bios7)]);
    managed.push(['DS', 'BIOS9Path', quoted(paths.bios9)]);
    managed.push(['DS', 'FirmwarePath', quoted(paths.firmware)]);
  }

  return managed;
}

/** Sets `key = value` inside `[section]`, creating the section when needed. */
export function setTomlKey(lines: string[], section: string, key: string, rawValue: string): void {
  const header = `[${section}]`;
  let sectionIndex = lines.indexOf(header);
  if (sectionIndex < 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(header, '');
    sectionIndex = lines.length - 2;
  }

  let end = lines.length;
  for (let i = sectionIndex + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('[')) {
      end = i;
      break;
    }
  }

  const keyLine = `${key} = ${rawValue}`;
  for (let i = sectionIndex + 1; i < end; i += 1) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith(`${key} `) || trimmed.startsWith(`${key}=`)) {
      lines[i] = keyLine;
      return;
    }
  }
  lines.splice(end, 0, keyLine);
}

/** Applies every managed key to the file contents and returns the new text. */
export function patchMelondsToml(current: string, options: MelondsConfigOptions): string {
  const lines = current.split(/\r?\n/);
  // Drop the trailing empty line produced by split() so joins stay tidy.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  for (const [section, key, value] of melondsManagedKeys(options)) {
    setTomlKey(lines, section, key, value);
  }

  return `${lines.join('\n')}\n`;
}
