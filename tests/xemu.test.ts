import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  XBOX_BIOS_SIZE,
  XBOX_MCPX_SIZE,
  importXboxFirmware,
  missingXboxFirmware,
  normalizeBios,
  readXboxFirmware,
  writeXemuConfig,
  xemuConfigPath,
  xemuLaunchArgs,
} from '../src/main/xemu';

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'nest-xemu-'));
}

describe('xemu firmware helpers', () => {
  it('accepts a plain 256 KB flash dump', () => {
    const bytes = Buffer.alloc(XBOX_BIOS_SIZE, 0x11);
    const probe = normalizeBios(bytes);
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.bytes.length).toBe(XBOX_BIOS_SIZE);
  });

  it('trims the 1 MB four-bank dump to its first bank', () => {
    const bank = Buffer.alloc(XBOX_BIOS_SIZE, 0x22);
    const probe = normalizeBios(Buffer.concat([bank, bank, bank, bank]));
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.bytes.equals(bank)).toBe(true);
  });

  it('rejects a 1 MB dump whose banks differ', () => {
    const first = Buffer.alloc(XBOX_BIOS_SIZE, 0x22);
    const other = Buffer.alloc(XBOX_BIOS_SIZE, 0x33);
    expect(normalizeBios(Buffer.concat([first, other, first, first])).ok).toBe(false);
    expect(normalizeBios(Buffer.alloc(4096)).ok).toBe(false);
  });

  it('imports MCPX and BIOS, then reports a complete firmware set', async () => {
    const userData = await tempDir();
    const source = path.join(userData, 'mcpx.bin');
    await writeFile(source, Buffer.alloc(XBOX_MCPX_SIZE, 1));
    const mcpx = importXboxFirmware('xbox-mcpx', source, userData);
    expect(mcpx.ok).toBe(true);

    const biosSource = path.join(userData, 'bios.bin');
    await writeFile(biosSource, Buffer.alloc(XBOX_BIOS_SIZE, 2));
    const bios = importXboxFirmware('xbox-bios', biosSource, userData);
    expect(bios.ok).toBe(true);

    const hddSource = path.join(userData, 'xbox_hdd.qcow2');
    await writeFile(hddSource, Buffer.concat([Buffer.from('QFI\xfb'), Buffer.alloc(4096)]));
    const hdd = importXboxFirmware('xbox-hdd', hddSource, userData);
    expect(hdd.ok).toBe(true);

    const firmware = readXboxFirmware(userData, hddSource);
    expect(missingXboxFirmware(firmware)).toEqual([]);
    expect(firmware.mcpx).not.toBeNull();
    expect(firmware.bios).not.toBeNull();
    expect(firmware.hdd).toBe(hddSource);

    await rm(userData, { recursive: true, force: true });
  });

  it('rejects firmware of the wrong size', async () => {
    const userData = await tempDir();
    const badMcpx = path.join(userData, 'bad-mcpx.bin');
    await writeFile(badMcpx, Buffer.alloc(256));
    expect(importXboxFirmware('xbox-mcpx', badMcpx, userData).ok).toBe(false);

    const badBios = path.join(userData, 'bad-bios.bin');
    await writeFile(badBios, Buffer.alloc(1024));
    expect(importXboxFirmware('xbox-bios', badBios, userData).ok).toBe(false);

    const badHdd = path.join(userData, 'bad-hdd.qcow2');
    await writeFile(badHdd, Buffer.from('not-a-qcow2'));
    expect(importXboxFirmware('xbox-hdd', badHdd, userData).ok).toBe(false);
    await rm(userData, { recursive: true, force: true });
  });

  it('writes xemu.toml next to the engine once firmware is complete', async () => {
    const userData = await tempDir();
    const engineDir = await tempDir();
    expect(writeXemuConfig(engineDir, userData).ok).toBe(false);

    const mcpx = path.join(userData, 'mcpx.bin');
    await writeFile(mcpx, Buffer.alloc(XBOX_MCPX_SIZE, 1));
    importXboxFirmware('xbox-mcpx', mcpx, userData);
    const bios = path.join(userData, 'bios.bin');
    await writeFile(bios, Buffer.alloc(XBOX_BIOS_SIZE, 2));
    importXboxFirmware('xbox-bios', bios, userData);
    const hdd = path.join(userData, 'xbox_hdd.qcow2');
    await writeFile(hdd, Buffer.concat([Buffer.from('QFI\xfb'), Buffer.alloc(4096)]));

    const result = writeXemuConfig(engineDir, userData, hdd);
    expect(result.ok).toBe(true);
    expect(result.path).toBe(xemuConfigPath(engineDir));

    const toml = await readFile(result.path, 'utf8');
    expect(toml).toContain('[general]');
    expect(toml).toContain('show_welcome = false');
    expect(toml).toContain("bootrom_path = '");
    expect(toml).toContain('flashrom_path');
    expect(toml).toContain('hdd_path');
    expect(toml).toContain('eeprom_path');

    const args = xemuLaunchArgs(userData, hdd);
    expect(args[0]).toBe('-bios');
    expect(args[1]).toContain('bios.bin');

    await stat(result.path);
    await rm(userData, { recursive: true, force: true });
    await rm(engineDir, { recursive: true, force: true });
  });
});
