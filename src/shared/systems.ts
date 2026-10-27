/** The console catalog. Pure data: no Electron, no React — shared by main and renderer. */

export type FamilyId = 'nintendo' | 'xbox' | 'playstation';

export type SystemId =
  | 'fc' | 'sfc' | 'n64' | 'gba' | 'ngc' | 'nds' | 'wii' | '3ds' | 'wiiu'
  | 'xbox' | 'xbox360'
  | 'ps1' | 'ps2' | 'psp' | 'ps3';

export type SystemState = 'ready' | 'warn' | 'locked';

export interface SystemDef {
  id: SystemId;
  name: string;
  short: string;
  /** Release year, used for the timeline ordering. */
  year: number;
  kind: '家用机' | '掌机';
  family: FamilyId;
  /** Preferred engine manifest id. */
  engine: string;
  /** Cut-out photo in the renderer's public folder. */
  image: string;
  state: SystemState;
  note?: string;
  /** Real system menu this console can boot into, if any. */
  systemMode?: string;
}

export const SYSTEMS: SystemDef[] = [
  { id: 'fc',    name: 'Family Computer',   short: 'FC',    year: 1983, kind: '家用机', family: 'nintendo', engine: 'ares',     image: 'consoles/fc.webp',   state: 'ready' },
  { id: 'sfc',   name: 'Super Famicom',     short: 'SFC',   year: 1990, kind: '家用机', family: 'nintendo', engine: 'ares',     image: 'consoles/sfc.webp',  state: 'ready' },
  { id: 'n64',   name: 'Nintendo 64',       short: 'N64',   year: 1996, kind: '家用机', family: 'nintendo', engine: 'ares',     image: 'consoles/n64.webp',  state: 'ready' },
  { id: 'gba',   name: 'Game Boy Advance',  short: 'GBA',   year: 2001, kind: '掌机',   family: 'nintendo', engine: 'mgba',     image: 'consoles/gba.webp',  state: 'ready', note: 'BIOS 开机动画随游戏启动' },
  { id: 'ngc',   name: 'Nintendo GameCube', short: 'NGC',   year: 2001, kind: '家用机', family: 'nintendo', engine: 'dolphin',  image: 'consoles/ngc.webp',  state: 'ready', systemMode: 'IPL 系统菜单', note: '需自备有效 IPL（已内置引导自动化）' },
  { id: 'nds',   name: 'Nintendo DS',       short: 'NDS',   year: 2004, kind: '掌机',   family: 'nintendo', engine: 'melonds',  image: 'consoles/nds.webp',  state: 'ready', systemMode: 'DS 固件菜单' },
  { id: 'wii',   name: 'Nintendo Wii',      short: 'Wii',   year: 2006, kind: '家用机', family: 'nintendo', engine: 'dolphin',  image: 'consoles/wii.webp',  state: 'ready', note: '需自备游戏镜像；Wii Menu 待 NAND' },
  { id: '3ds',   name: 'Nintendo 3DS',      short: '3DS',   year: 2011, kind: '掌机',   family: 'nintendo', engine: 'citra',    image: 'consoles/3ds.webp',  state: 'ready', systemMode: 'HOME Menu', note: 'HOME Menu 需系统文件' },
  { id: 'wiiu',  name: 'Wii U',             short: 'Wii U', year: 2012, kind: '家用机', family: 'nintendo', engine: 'cemu',     image: 'consoles/wiiu.webp', state: 'warn', systemMode: 'Wii U Menu', note: '需导入 MLC 与密钥' },

  { id: 'xbox',    name: 'Xbox',     short: 'XBX',  year: 2001, kind: '家用机', family: 'xbox', engine: 'xemu',    image: '', state: 'locked' },
  { id: 'xbox360', name: 'Xbox 360', short: 'X360', year: 2005, kind: '家用机', family: 'xbox', engine: 'xenia',   image: '', state: 'locked' },

  { id: 'ps1', name: 'PlayStation',          short: 'PS1', year: 1994, kind: '家用机', family: 'playstation', engine: 'duckstation', image: '', state: 'locked' },
  { id: 'ps2', name: 'PlayStation 2',        short: 'PS2', year: 2000, kind: '家用机', family: 'playstation', engine: 'pcsx2',       image: '', state: 'locked' },
  { id: 'psp', name: 'PlayStation Portable', short: 'PSP', year: 2004, kind: '掌机',   family: 'playstation', engine: 'ppsspp',      image: '', state: 'locked' },
  { id: 'ps3', name: 'PlayStation 3',        short: 'PS3', year: 2006, kind: '家用机', family: 'playstation', engine: 'rpcs3',       image: '', state: 'locked' },
];

export const FAMILIES: { id: FamilyId; name: string; locked: boolean }[] = [
  { id: 'nintendo',    name: 'Nintendo',    locked: false },
  { id: 'xbox',        name: 'Xbox',        locked: true },
  { id: 'playstation', name: 'PlayStation', locked: true },
];

export const systemById = new Map(SYSTEMS.map((s) => [s.id, s]));

export function systemsOf(family: FamilyId): SystemDef[] {
  return SYSTEMS.filter((s) => s.family === family).sort((a, b) => a.year - b.year);
}

/**
 * Display names for engines. Manifests carry a name too, but the renderer needs
 * a label before the engine list is fetched (and for systems with no engine).
 */
export const ENGINE_LABEL: Record<string, string> = {
  mgba: 'mGBA',
  ares: 'ares',
  dolphin: 'Dolphin',
  melonds: 'melonDS',
  citra: 'Citra',
  cemu: 'Cemu',
  duckstation: 'DuckStation',
  pcsx2: 'PCSX2',
  ppsspp: 'PPSSPP',
  rpcs3: 'RPCS3',
  xemu: 'xemu',
  xenia: 'Xenia',
  fake: '测试引擎',
};

export function engineLabel(id: string | null | undefined): string {
  if (!id) return '';
  return ENGINE_LABEL[id] ?? id;
}