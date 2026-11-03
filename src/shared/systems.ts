/** The console catalog. Pure data: no Electron, no React — shared by main and renderer. */

export type FamilyId = 'nintendo' | 'xbox' | 'playstation';

export type SystemId =
  | 'fc' | 'sfc' | 'n64' | 'gba' | 'ngc' | 'nds' | 'wii' | '3ds' | 'wiiu'
  | 'xbox' | 'xbox360'
  | 'ps1' | 'ps2' | 'psp' | 'ps3';

export type SystemState = 'ready' | 'warn' | 'locked';

/** Model variants inside one console family (DS / DS Lite / DSi / DSi XL). */
export type NdsModelId = 'ds' | 'dsl' | 'dsi' | 'dsill';

export interface SystemModel {
  id: NdsModelId;
  /** Short label shown on the model chip, e.g. "DSL" or "DSiLL". */
  label: string;
  year: number;
  image: string;
  /** melonDS console type this model boots as. */
  consoleType: 'nds' | 'dsi';
}

/** Two groups in the NDS info card; names use a slash to pair each revision. */
export const NDS_MODEL_GROUPS: { title: string; models: NdsModelId[] }[] = [
  { title: 'DS / DSL', models: ['ds', 'dsl'] },
  { title: 'DSi / DSiLL', models: ['dsi', 'dsill'] },
];

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
  /** Model revisions inside this console (NDS family). */
  models?: SystemModel[];
}

export const SYSTEMS: SystemDef[] = [
  { id: 'fc',    name: 'Family Computer',   short: 'FC',    year: 1983, kind: '家用机', family: 'nintendo', engine: 'ares',     image: 'consoles/fc.webp',   state: 'ready' },
  { id: 'sfc',   name: 'Super Famicom',     short: 'SFC',   year: 1990, kind: '家用机', family: 'nintendo', engine: 'ares',     image: 'consoles/sfc.webp',  state: 'ready' },
  { id: 'n64',   name: 'Nintendo 64',       short: 'N64',   year: 1996, kind: '家用机', family: 'nintendo', engine: 'ares',     image: 'consoles/n64.webp',  state: 'ready' },
  { id: 'gba',   name: 'Game Boy Advance',  short: 'GBA',   year: 2001, kind: '掌机',   family: 'nintendo', engine: 'mgba',     image: 'consoles/gba.webp',  state: 'ready', note: 'BIOS 开机动画随游戏启动' },
  { id: 'ngc',   name: 'Nintendo GameCube', short: 'NGC',   year: 2001, kind: '家用机', family: 'nintendo', engine: 'dolphin',  image: 'consoles/ngc.webp',  state: 'ready', systemMode: 'GameCube Menu', note: '直读可用；系统菜单需自备对应区域 IPL.bin（NGC 主菜单受 libretro 核心限制，仍用 Qt 自动化）' },
  { id: 'nds',   name: 'Nintendo DS',       short: 'NDS',   year: 2004, kind: '掌机',   family: 'nintendo', engine: 'melonds',  image: 'consoles/nds.webp',  state: 'ready', systemMode: 'DS / DSi 菜单', note: '机型可选 DS / DSL / DSi / DSiLL；系统菜单需自备对应固件',
    models: [
      { id: 'ds',    label: 'DS',    year: 2004, image: 'consoles/nds.webp',   consoleType: 'nds' },
      { id: 'dsl',   label: 'DSL',   year: 2006, image: 'consoles/ndsl.webp',  consoleType: 'nds' },
      { id: 'dsi',   label: 'DSi',   year: 2008, image: 'consoles/dsi.webp',   consoleType: 'dsi' },
      { id: 'dsill', label: 'DSiLL', year: 2009, image: 'consoles/dsill.webp', consoleType: 'dsi' },
    ] },
  { id: 'wii',   name: 'Nintendo Wii',      short: 'Wii',   year: 2006, kind: '家用机', family: 'nintendo', engine: 'dolphin',  image: 'consoles/wii.webp',  state: 'ready', systemMode: 'Wii Menu', note: '需自备 wii-menu.wad（设置 → 系统文件（自备）导入）' },
  { id: '3ds',   name: 'Nintendo 3DS',      short: '3DS',   year: 2011, kind: '掌机',   family: 'nintendo', engine: 'azahar',   image: 'consoles/3ds.webp',  state: 'ready', systemMode: '3DS HOME Menu（实验性）', note: '直读可用；HOME Menu 需先安装 Azahar 系统文件（Artic Setup Tool），未安装时启动会明确提示' },
    { id: 'wiiu',  name: 'Wii U',             short: 'Wii U', year: 2012, kind: '家用机', family: 'nintendo', engine: 'cemu',     image: 'consoles/wiiu.webp', state: 'warn', systemMode: 'Wii U Menu（实验性）', note: '直读需自备 keys.txt 与游戏；Wii U Menu 目前受 Cemu 2.6 限制（只能到背景），标记为实验性' },

  { id: 'xbox',    name: 'Xbox',     short: 'XBX',  year: 2001, kind: '家用机', family: 'xbox', engine: 'xemu',    image: '', state: 'locked' },
  { id: 'xbox360', name: 'Xbox 360', short: 'X360', year: 2005, kind: '家用机', family: 'xbox', engine: 'xenia',   image: '', state: 'locked' },

  { id: 'ps1', name: 'PlayStation',          short: 'PS1', year: 1994, kind: '家用机', family: 'playstation', engine: 'swanstation', image: 'consoles/ps1.webp', state: 'ready', note: 'SwanStation 直读；BIOS 可选（OpenBIOS 兜底）；无系统菜单（BIOS shell 需 DuckStation）' },
  { id: 'ps2', name: 'PlayStation 2',        short: 'PS2', year: 2000, kind: '家用机', family: 'playstation', engine: 'pcsx2',       image: 'consoles/ps2.webp', state: 'warn', note: '界面已就绪；引擎待接入（P6.3），系统菜单为 BIOS 浏览器' },
  { id: 'psp', name: 'PlayStation Portable', short: 'PSP', year: 2004, kind: '掌机',   family: 'playstation', engine: 'ppsspp',      image: 'consoles/psp.webp', state: 'warn', note: '界面已就绪；引擎待接入（P6.2），XMB 需 PPSSPP 1.21+' },
  { id: 'ps3', name: 'PlayStation 3',        short: 'PS3', year: 2006, kind: '家用机', family: 'playstation', engine: 'rpcs3',       image: 'consoles/ps3.webp', state: 'warn', note: '界面已就绪；引擎待接入（P6.4），无系统菜单' },
];

export const FAMILIES: { id: FamilyId; name: string; locked: boolean }[] = [
  { id: 'nintendo',    name: 'Nintendo',    locked: false },
  { id: 'xbox',        name: 'Xbox',        locked: true },
  { id: 'playstation', name: 'PlayStation', locked: false },
];

export const systemById = new Map(SYSTEMS.map((s) => [s.id, s]));

/** All NDS model variants (DS, DS Lite, DSi, DSi XL). */
export const NDS_MODELS: SystemModel[] = SYSTEMS.find((s) => s.id === 'nds')?.models ?? [];

export function ndsModelById(id: string | null | undefined): SystemModel {
  return NDS_MODELS.find((model) => model.id === id) ?? NDS_MODELS[0];
}

/** Which melonDS console type the selected model needs. */
export function ndsModelConsole(id: string | null | undefined): 'nds' | 'dsi' {
  return ndsModelById(id).consoleType;
}

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
  azahar: 'Azahar',
  cemu: 'Cemu',
  duckstation: 'DuckStation',
  swanstation: 'SwanStation',
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