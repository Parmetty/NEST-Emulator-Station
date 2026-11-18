import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { extractZip } from './zip';

/** Extract a VPK (plain zip) into a folder; Vita3K's folder install is more tolerant than its VPK installer. */
export function extractVpk(vpk: string, dest: string): boolean {
  if (!extractZip(vpk, dest)) return false;
  return existsSync(path.join(dest, 'eboot.bin')) || existsSync(path.join(dest, 'sce_sys', 'param.sfo'));
}

/** Cache an extracted VPK by source identity so repeat launches skip the unzip. */
export function ensureVpkExtracted(vpk: string, cacheRoot: string): string | null {
  const stat = statSync(vpk);
  const key = createHash('sha1').update(vpk + '|' + stat.size + '|' + stat.mtimeMs).digest('hex').slice(0, 16);
  const dest = path.join(cacheRoot, key);
  if (existsSync(path.join(dest, 'eboot.bin')) || existsSync(path.join(dest, 'sce_sys', 'param.sfo'))) return dest;
  mkdirSync(cacheRoot, { recursive: true });
  return extractVpk(vpk, dest) ? dest : null;
}
