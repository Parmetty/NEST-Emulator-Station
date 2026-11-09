/**
 * xemu (Xbox) integration helpers.
 *
 * xemu runs in portable mode when a `xemu.toml` sits next to `xemu.exe`; without
 * it the settings code asks SDL for %APPDATA% and aborts (assertion in
 * ui/xemu-settings.cc line 86), so Nest writes that file next to the bundled
 * engine on every launch and keeps the machine config inside the engine folder.
 *
 * Firmware is user-supplied and never bundled: the MCPX boot ROM (512 B), a
 * 256 KB flash ROM dump and an HDD image. xemu 0.8.139 does not turn
 * `flashrom_path` into a `-bios` argument by itself, so Nest passes it
 * explicitly; the HDD is only referenced in the config and lives wherever the
 * user keeps it (it is a writable qcow2 image, never copied).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const XBOX_MCPX_SIZE = 512;
export const XBOX_BIOS_SIZE = 256 * 1024;
export const XBOX_HDD_MAGIC = 'QFI';

export type XboxFirmwareKind = 'xbox-mcpx' | 'xbox-bios' | 'xbox-hdd';

export function xboxDataDir(userData: string): string {
  return path.join(userData, 'xbox');
}

export function xboxFirmwareDir(userData: string): string {
  return path.join(xboxDataDir(userData), 'firmware');
}

export function xboxEepromPath(userData: string): string {
  return path.join(xboxDataDir(userData), 'eeprom.bin');
}

export function xemuEngineDir(enginesDir: string): string {
  return path.join(enginesDir, 'xemu');
}

export function xemuConfigPath(engineDir: string): string {
  return path.join(engineDir, 'xemu.toml');
}

function fileSize(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

export interface XboxFirmware {
  mcpx: string | null;
  bios: string | null;
  hdd: string | null;
  eeprom: string;
}

/** Reads the firmware Nest owns plus the HDD path the user picked in settings. */
export function readXboxFirmware(userData: string, hddPath?: string | null): XboxFirmware {
  const dir = xboxFirmwareDir(userData);
  const mcpx = path.join(dir, 'mcpx_1.0.bin');
  const bios = path.join(dir, 'bios.bin');
  return {
    mcpx: fileSize(mcpx) === XBOX_MCPX_SIZE ? mcpx : null,
    bios: fileSize(bios) === XBOX_BIOS_SIZE ? bios : null,
    hdd: hddPath && fileSize(hddPath) > 0 ? hddPath : null,
    eeprom: xboxEepromPath(userData),
  };
}

/** Firmware kinds still missing before xemu can boot anything. */
export function missingXboxFirmware(firmware: XboxFirmware): XboxFirmwareKind[] {
  const missing: XboxFirmwareKind[] = [];
  if (!firmware.mcpx) missing.push('xbox-mcpx');
  if (!firmware.bios) missing.push('xbox-bios');
  if (!firmware.hdd) missing.push('xbox-hdd');
  return missing;
}

export type BiosProbe = { ok: true; bytes: Buffer } | { ok: false; reason: 'bad-size' };

/**
 * Accepts a 256 KB flash dump, and the common 1 MB dump that concatenates four
 * identical banks (only the first bank is kept). Anything else is rejected.
 */
export function normalizeBios(buffer: Buffer): BiosProbe {
  if (buffer.length === XBOX_BIOS_SIZE) return { ok: true, bytes: buffer };
  if (buffer.length === XBOX_BIOS_SIZE * 4) {
    const bank = buffer.subarray(0, XBOX_BIOS_SIZE);
    for (let i = 1; i < 4; i += 1) {
      const other = buffer.subarray(i * XBOX_BIOS_SIZE, (i + 1) * XBOX_BIOS_SIZE);
      if (!bank.equals(other)) return { ok: false, reason: 'bad-size' };
    }
    return { ok: true, bytes: Buffer.from(bank) };
  }
  return { ok: false, reason: 'bad-size' };
}

export type XboxImportResult =
  | { ok: true; path: string; kind: XboxFirmwareKind }
  | { ok: false; error: string };

/** Copies one small firmware file into Nest's data folder. HDDs are not copied. */
export function importXboxFirmware(
  kind: XboxFirmwareKind,
  source: string,
  userData: string,
): XboxImportResult {
  const dir = xboxFirmwareDir(userData);
  mkdirSync(dir, { recursive: true });

  if (kind === 'xbox-mcpx') {
    if (fileSize(source) !== XBOX_MCPX_SIZE) return { ok: false, error: 'bad-size-xbox-mcpx' };
    const target = path.join(dir, 'mcpx_1.0.bin');
    copyFileSync(source, target);
    return { ok: true, path: target, kind };
  }

  if (kind === 'xbox-bios') {
    const probe = normalizeBios(readFileSync(source));
    if (!probe.ok) return { ok: false, error: 'bad-size-xbox-bios' };
    const target = path.join(dir, 'bios.bin');
    writeFileSync(target, probe.bytes);
    return { ok: true, path: target, kind };
  }

  // HDD image: only validate it, the setting stores the path (the image is
  // writable and can be several GB, so Nest never duplicates it).
  if (!existsSync(source) || fileSize(source) < 1024) {
    return { ok: false, error: 'bad-size-xbox-hdd' };
  }
  try {
    const head = readFileSync(source, { encoding: null }).subarray(0, 3).toString('latin1');
    if (head !== XBOX_HDD_MAGIC) return { ok: false, error: 'bad-size-xbox-hdd' };
  } catch {
    return { ok: false, error: 'xbox-hdd-io-error' };
  }
  return { ok: true, path: path.normalize(source), kind };
}

export interface XemuConfigResult {
  ok: boolean;
  path: string;
  missing: XboxFirmwareKind[];
}

/**
 * Writes `xemu.toml` next to the bundled engine (this is what enables portable
 * mode). Returns the missing firmware kinds instead of throwing so the caller
 * can refuse the launch with a clear error.
 */
export function writeXemuConfig(
  engineDir: string,
  userData: string,
  hddPath?: string | null,
): XemuConfigResult {
  const firmware = readXboxFirmware(userData, hddPath);
  const missing = missingXboxFirmware(firmware);
  if (!firmware.mcpx || !firmware.bios || !firmware.hdd) {
    return { ok: false, path: xemuConfigPath(engineDir), missing };
  }
  mkdirSync(xboxDataDir(userData), { recursive: true });
  const toml = [
    '[general]',
    'show_welcome = false',
    '',
    '[sys.files]',
    `bootrom_path = '${firmware.mcpx.replace(/\\/g, '/')}'`,
    `flashrom_path = '${firmware.bios.replace(/\\/g, '/')}'`,
    `hdd_path = '${firmware.hdd.replace(/\\/g, '/')}'`,
    `eeprom_path = '${firmware.eeprom.replace(/\\/g, '/')}'`,
    '',
  ].join('\n');
  const target = xemuConfigPath(engineDir);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, toml, 'utf8');
  return { ok: true, path: target, missing: [] };
}

/** Extra arguments xemu needs before it honours the config file. */
export function xemuLaunchArgs(userData: string, hddPath?: string | null): string[] {
  const firmware = readXboxFirmware(userData, hddPath);
  return firmware.bios ? ['-bios', firmware.bios] : [];
}
