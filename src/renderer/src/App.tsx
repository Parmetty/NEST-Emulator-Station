import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ControlsPayload,
  FamilyView,
  FirmwareKind,
  FirmwareState,
  GameRecord,
  HomePayload,
  KeyCode,
  KeyboardBindings,
  LaunchEvent,
  LaunchMode,
  PadAction,
  Settings,
  SystemView,
} from '@shared/contract';
import { PAD_ACTIONS } from '@shared/contract';
import { engineLabel, ndsModelById, NDS_MODEL_GROUPS, systemById, type SystemId } from '@shared/systems';
import {
  isPlaystationEngine,
  isXboxEngine,
  keyPanelTargetForTab,
} from '../../shared/key-panel';

type Row =
  | { kind: 'family'; family: FamilyView }
  | { kind: 'system'; family: FamilyView; system: SystemView };

type Selection = { type: 'family' | 'system'; id: string };

const SHELF_COLUMNS = 5;

/** Consoles with editable keyboard bindings, in the order the chips are shown. */
const KEY_SYSTEMS = (['gba', 'fc', 'sfc', 'n64', 'nds', 'ngc', 'wii', '3ds', 'wiiu', 'ps1', 'ps2', 'psp', 'ps3', 'xbox', 'xbox360'] as const).flatMap((id) => {
  const system = systemById.get(id);
  return system ? [system] : [];
});

const SETTINGS_TABS = [
  { id: 'nest', name: 'Nest', hint: '通用偏好 · 游戏文件夹' },
  { id: 'nintendo', name: 'Nintendo', hint: '系统文件 · 键位' },
  { id: 'xbox', name: 'Xbox', hint: '主机墙已加入 · 引擎接入中' },
  { id: 'playstation', name: 'PlayStation', hint: 'PS1/PS2/PSP/PS3 已接入' },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

const ACTION_LABEL: Record<PadAction, string> = {
  up: '上',
  down: '下',
  left: '左',
  right: '右',
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  l: 'L',
  r: 'R',
  start: 'Start',
  select: 'Select',
};

/** KeyboardEvent.code → the label shown inside the key badge. */
const KEY_LABEL: Record<string, string> = {
  Space: '空格',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: '退格',
  CapsLock: '大写',
  ShiftLeft: '左 Shift',
  ShiftRight: '右 Shift',
  ControlLeft: '左 Ctrl',
  ControlRight: '右 Ctrl',
  AltLeft: '左 Alt',
  AltRight: '右 Alt',
  NumpadEnter: '小键盘 Enter',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

function prettyKey(code: KeyCode | undefined): string {
  if (!code) return '未绑定';
  const known = KEY_LABEL[code];
  if (known) return known;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `小键盘 ${code.slice(6)}`;
  return code;
}

function relpath(image: string): string {
  return image ? `./${image.replace(/^\/+/, '')}` : '';
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function relativeTime(at: number | null): string {
  if (!at) return '从未游玩';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

/** Seeded demo data uses words ("昨天"), real sessions store ISO timestamps. */
function displayLastPlayed(value: string | null): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : relativeTime(parsed);
}

export default function App() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [sel, setSel] = useState<Selection>({ type: 'system', id: 'gba' });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ name: string; meta: string } | null>(null);
  const [dialog, setDialog] = useState<{ system: SystemView; mode: LaunchMode; game?: GameRecord } | null>(
    null,
  );
  const [shelf, setShelf] = useState<{ system: SystemView; games: GameRecord[]; loading: boolean } | null>(
    null,
  );
  const [shelfIndex, setShelfIndex] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [settings, setSettings] = useState<Settings>({ minimizeOnLaunch: true, fullscreen: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('nest');
  const [firmware, setFirmware] = useState<FirmwareState[]>([]);
  const [mlcTipOpen, setMlcTipOpen] = useState(false);
  const [controls, setControls] = useState<ControlsPayload | null>(null);
  const [controlsFailed, setControlsFailed] = useState(false);
  const [keySystemId, setKeySystemId] = useState('gba');
  const [keyDrafts, setKeyDrafts] = useState<Record<string, KeyboardBindings>>({});
  const [keyCapture, setKeyCapture] = useState<PadAction | null>(null);
  const [keyCaptureError, setKeyCaptureError] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState<'save' | 'reset' | null>(null);
  const [runningSystems, setRunningSystems] = useState<Record<string, number>>({});
  const [runningGames, setRunningGames] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; game: GameRecord } | null>(null);
  const [rename, setRename] = useState<{ game: GameRecord; text: string } | null>(null);
  const [cheat, setCheat] = useState<{
    game: GameRecord;
    text: string;
    path: string;
    managed: boolean;
    busy: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    window.nest
      .settings()
      .then(setSettings)
      .catch(() => undefined);
  }, []);

  const updateSetting = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    await window.nest.saveSettings(patch).catch(() => undefined);
  }, []);


  /* ------------------------------------------------------------- data */
  useEffect(() => {
    let alive = true;
    window.nest
      .home()
      .then((payload) => {
        if (!alive) return;
        setHome(payload);
        const nintendo = payload.families.find((f) => f.id === 'nintendo');
        const first = nintendo?.systems.find((s) => s.id === 'gba') ?? nintendo?.systems[0];
        if (first) setSel({ type: 'system', id: first.id });
        setFavorites(
          new Set(payload.families.flatMap((f) => f.systems.filter((s) => s.favorite).map((s) => s.id))),
        );
        window.__NEST_READY__ = true;
      })
      .catch((err: Error) => setToast(`加载失败：${err.message}`));
    return () => {
      alive = false;
    };
  }, []);

  const refreshHome = useCallback(async () => {
    try {
      const payload = await window.nest.home();
      setHome(payload);
    } catch {
      /* keep old data */
    }
  }, []);

  const refreshShelf = useCallback(async (systemId: string) => {
    try {
      const games = await window.nest.games(systemId);
      setShelf((prev) => (prev && prev.system.id === systemId ? { ...prev, games } : prev));
    } catch {
      /* ignore */
    }
  }, []);

  const bump = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Record<string, number>>>, key: string | null | undefined, delta: number) => {
      if (!key) return;
      setter((prev) => {
        const next = { ...prev };
        const value = (next[key] ?? 0) + delta;
        if (value > 0) next[key] = value;
        else delete next[key];
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const off = window.nest.onLaunchEvent((event: LaunchEvent) => {
      if (event.state === 'starting') {
        bump(setRunningSystems, event.systemId, 1);
        bump(setRunningGames, event.gameId ?? null, 1);
      }
      if (event.state === 'exited' || event.state === 'crashed') {
        bump(setRunningSystems, event.systemId, -1);
        bump(setRunningGames, event.gameId ?? null, -1);
        void refreshShelf(event.systemId);
        void refreshHome();
        if (event.state === 'exited') setToast('已退出，返回 Nest');
        else setToast(`引擎异常退出${event.code ? `（${event.code}）` : ''}`);
      }
    });
    return off;
  }, [bump, refreshHome, refreshShelf]);

  /* ---------------------------------------------------------- derived */
  const families = home?.families ?? [];

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const family of families) {
      out.push({ kind: 'family', family });
      if (expanded.has(family.id)) {
        for (const system of family.systems) out.push({ kind: 'system', family, system });
      }
    }
    return out;
  }, [families, expanded]);

  const selectedSystem =
    sel.type === 'system'
      ? families.flatMap((f) => f.systems).find((s) => s.id === sel.id) ?? null
      : null;
  const selectedFamily = families.find(
    (f) => f.id === (sel.type === 'family' ? sel.id : selectedSystem?.family),
  );
  const locked = selectedSystem ? selectedSystem.state === 'locked' : false;
  const ndsModels = selectedSystem?.id === 'nds' ? (selectedSystem.models ?? []) : [];
  const activeModel = ndsModels.length > 0 ? ndsModelById(settings.ndsModel) : null;
  /** NDS uses the selected model's photo; every other console has one image. */
  const photoImage = activeModel?.image ?? selectedSystem?.image ?? '';
  const empty = !selectedSystem || locked || !photoImage;

  /* ------------------------------------------------------- photo swap */
  const [imgs, setImgs] = useState<[string, string]>(['', '']);
  const [front, setFront] = useState(0);
  const photoRef = useRef('');
  const frontRef = useRef(0);

  useEffect(() => {
    const next = selectedSystem && !locked ? relpath(photoImage) : '';
    if (!next || next === photoRef.current) return;
    photoRef.current = next;
    const slot = 1 - frontRef.current;
    frontRef.current = slot;
    setImgs((prev) => {
      const copy: [string, string] = [prev[0], prev[1]];
      copy[slot] = next;
      return copy;
    });
    setFront(slot);
  }, [selectedSystem, locked, photoImage]);

  /* ----------------------------------------------------------- motion */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = stageRef.current;
    if (!el) return;
    el.style.setProperty('--px', ((e.clientX / window.innerWidth - 0.5) * -14).toFixed(2));
    el.style.setProperty('--py', ((e.clientY / window.innerHeight - 0.5) * -10).toFixed(2));
  }, []);

  const say = useCallback((text: string) => {
    setToast(text);
  }, []);

  /* ---------------------------------------------------------- firmware */
  /* -------------------------------------------------------- scan roots */
  const [rescanning, setRescanning] = useState(false);

  const rescanAll = useCallback(async () => {
    setRescanning(true);
    try {
      const result = await window.nest.rescan();
      await refreshHome();
      if (result.ok) {
        const added = result.added ?? 0;
        say(added > 0 ? `重新扫描完成，新增 ${added} 个` : '重新扫描完成，没有新游戏');
      } else {
        say('扫描失败');
      }
    } catch {
      say('扫描失败');
    } finally {
      setRescanning(false);
    }
  }, [refreshHome, say]);

  const removeRoot = useCallback(
    async (root: string) => {
      await window.nest.removeScanRoot(root).catch(() => undefined);
      setSettings(await window.nest.settings().catch(() => settings));
      say('已移除这个文件夹');
    },
    [say, settings],
  );

  const addFolder = useCallback(async () => {
    try {
      // No systemId: the main process opens the folder picker and remembers the root.
      const result = await window.nest.scan();
      if (!result.ok) {
        if (result.error !== 'cancelled') say(`添加失败：${result.error ?? '未知错误'}`);
        return;
      }
      setSettings(await window.nest.settings().catch(() => settings));
      await refreshHome();
      say(`已添加文件夹，新增 ${result.added ?? 0} 个`);
    } catch {
      say('添加失败');
    }
  }, [refreshHome, say, settings]);

  // The silent boot scan finishes after the first paint; refresh with no toast.
  useEffect(
    () =>
      window.nest.onLibraryChanged(() => {
        void refreshHome();
      }),
    [refreshHome],
  );

  const refreshFirmware = useCallback(() => {
    void window.nest.firmwareStatus().then(setFirmware).catch(() => undefined);
  }, []);

  const importFirmware = useCallback(
    async (kind: FirmwareKind) => {
      const result = await window.nest.pickFirmware(kind).catch(() => null);
      if (!result || result.canceled) return;
      if (!result.ok) {
        const messages: Record<string, string> = {
          'ipl-not-recognized': '这个 IPL 不是 Dolphin 认可的转储',
          'missing-bios7.bin': 'DSi 固件目录里缺少 bios7.bin',
          'missing-bios9.bin': 'DSi 固件目录里缺少 bios9.bin',
          'missing-firmware.bin': 'DSi 固件目录里缺少 firmware.bin',
          'missing-nand.bin': 'DSi 固件目录里缺少 nand.bin',
          'bad-size-bios7.bin': 'bios7.bin 大小不对（DSi 应为 64 KB）',
          'bad-size-bios9.bin': 'bios9.bin 大小不对（DSi 应为 64 KB）',
          'bad-size-firmware.bin': 'firmware.bin 大小不对（DSi 应为 128 KB）',
          'bad-size-nand.bin': 'nand.bin 大小不对（应为 0xF000000 = 240 MB）',
          'missing-cemu-keys': 'keys.txt 里没有有效的 32 位十六进制密钥行',
          'invalid-wiiu-mlc': '这个目录不是 Wii U NAND（缺少 sys/title/00050010/10040000 或 usr/）',
          'keys-io-error': '读取 / 写入 keys.txt 失败',
        };
        say(messages[result.error ?? ''] ?? '导入失败');
        return;
      }
      say(result.state?.status === 'ok' ? '已导入并校验通过' : '已导入，但校验未通过');
      refreshFirmware();
    },
    [refreshFirmware, say],
  );

  /* ---------------------------------------------------------- controls */
  const refreshControls = useCallback(async () => {
    try {
      setControls(await window.nest.controls());
      setControlsFailed(false);
    } catch {
      setControlsFailed(true);
    }
  }, []);

  // Fetch before the dialog opens: `--settings --shot=` clicks 设置 ~1.8s after
  // load, so the panel is already populated when the screenshot is taken.
  useEffect(() => {
    void refreshControls();
  }, [refreshControls]);

  const keySystem = KEY_SYSTEMS.find((system) => system.id === keySystemId) ?? KEY_SYSTEMS[0];
  const keyEngine = keySystem.engine;
  const keyView = controls?.engines[keyEngine] ?? null;
  const keyBindings: KeyboardBindings = {
    ...(keyView?.current ?? {}),
    ...(keyDrafts[keyEngine] ?? {}),
  };
  const keySupported = Boolean(keyView?.supported);
  const keyShared = KEY_SYSTEMS.filter((system) => system.engine === keyEngine).map(
    (system) => system.short,
  );
  const keyDirty = useMemo(() => {
    const draft = keyDrafts[keyEngine];
    if (!draft) return false;
    return PAD_ACTIONS.some(
      (action) => draft[action] !== undefined && draft[action] !== keyView?.current[action],
    );
  }, [keyDrafts, keyEngine, keyView]);

  useEffect(() => {
    if (keySystemPinned.current) {
      keySystemPinned.current = false;
      return;
    }
    const target = keyPanelTargetForTab(settingsTab, keySystem.engine);
    if (target) setKeySystemId(target);
  }, [settingsTab]);

  const keySystemPinned = useRef(false);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    refreshFirmware();
    // Start the key panel on the console the user is looking at, if supported.
    if (sel.type === 'system' && KEY_SYSTEMS.some((system) => system.id === sel.id)) {
      setKeySystemId(sel.id);
    }
    void refreshControls();
  }, [refreshControls, refreshFirmware, sel]);

  // Closing the dialog must leave capture mode too, otherwise keydowns would
  // keep being swallowed with no visible target.
  useEffect(() => {
    if (settingsOpen) return;
    setKeyCapture(null);
    setKeyCaptureError(null);
  }, [settingsOpen]);

  const pickKeySystem = useCallback((id: string) => {
    setKeySystemId(id);
    setKeyCapture(null);
    setKeyCaptureError(null);
  }, []);

  const resolveBinding = useCallback(
    (action: PadAction): KeyCode | undefined =>
      keyDrafts[keyEngine]?.[action] ?? keyView?.current[action],
    [keyDrafts, keyEngine, keyView],
  );

  /** One keydown while capturing: rebind, or reject a key already used by this engine. */
  const captureKey = useCallback(
    (event: KeyboardEvent) => {
      if (!keyCapture) return;
      event.preventDefault();
      if (event.code === 'Escape' || event.key === 'Escape') {
        setKeyCapture(null);
        setKeyCaptureError(null);
        say('已取消改键');
        return;
      }
      const code = event.code;
      if (!code || code === 'Unidentified') {
        setKeyCaptureError('这个键读不出来，换一个试试');
        return;
      }
      const takenBy = PAD_ACTIONS.find(
        (action) => action !== keyCapture && resolveBinding(action) === code,
      );
      if (takenBy) {
        const message = `${prettyKey(code)} 已经绑给「${ACTION_LABEL[takenBy]}」，请换一个键`;
        setKeyCaptureError(message);
        say(message);
        return;
      }
      const action = keyCapture;
      setKeyDrafts((prev) => ({
        ...prev,
        [keyEngine]: { ...(prev[keyEngine] ?? keyView?.current ?? {}), [action]: code },
      }));
      setKeyCapture(null);
      setKeyCaptureError(null);
      say(`「${ACTION_LABEL[action]}」→ ${prettyKey(code)}，点「保存」生效`);
    },
    [keyCapture, keyEngine, keyView, resolveBinding, say],
  );

  const saveKeys = useCallback(async () => {
    if (!keyView?.supported || keyBusy) return;
    setKeyBusy('save');
    setKeyCaptureError(null);
    try {
      const result = await window.nest.saveControls(keyEngine, {
        mode: keyView.mode,
        keyboard: keyBindings,
        updatedAt: Date.now(),
      });
      if (!result.ok) {
        setKeyCaptureError(`保存失败${result.error ? `：${result.error}` : ''}`);
        return;
      }
      setKeyDrafts((prev) => {
        const next = { ...prev };
        delete next[keyEngine];
        return next;
      });
      await refreshControls();
      say(result.applied?.length ? `已保存并写入 ${result.applied.join(' / ')}` : '键位已保存并应用');
    } catch (err) {
      setKeyCaptureError(`保存失败：${(err as Error).message}`);
    } finally {
      setKeyBusy(null);
    }
  }, [keyBusy, keyBindings, keyEngine, keyView, refreshControls, say]);

  const resetKeys = useCallback(async () => {
    if (!keyView?.supported || keyBusy) return;
    setKeyBusy('reset');
    setKeyCaptureError(null);
    try {
      const result = await window.nest.resetControls(keyEngine);
      if (!result.ok) {
        setKeyCaptureError(`恢复默认失败${result.error ? `：${result.error}` : ''}`);
        return;
      }
      setKeyDrafts((prev) => {
        const next = { ...prev };
        delete next[keyEngine];
        return next;
      });
      await refreshControls();
      say(`${engineLabel(keyEngine)} 的键位已恢复默认`);
    } catch (err) {
      setKeyCaptureError(`恢复默认失败：${(err as Error).message}`);
    } finally {
      setKeyBusy(null);
    }
  }, [keyBusy, keyEngine, keyView, refreshControls, say]);

  // Single owner of "how long a toast lives". Every producer (say(), launch
  // events, load errors) just sets a string; this effect clears it.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* ------------------------------------------------------ navigation */
  const select = useCallback((type: Selection['type'], id: string) => {
    setSel({ type, id });
  }, []);

  const toggleFamily = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const askEnter = useCallback(
    (system: SystemView, mode: LaunchMode, game?: GameRecord) => {
      if (system.state === 'locked') {
        say(`${engineLabel(system.engine)} 尚未接入`);
        return;
      }
      setDialog({ system, mode, game });
    },
    [say],
  );

  /* --------------------------------------------------------- library */
  const openShelf = useCallback(
    async (system: SystemView) => {
      if (system.state === 'locked') {
        say(`${engineLabel(system.engine)} 尚未接入`);
        return;
      }
      setShelf({ system, games: [], loading: true });
      setShelfIndex(0);
      try {
        const games = await window.nest.games(system.id);
        setShelf({ system, games, loading: false });
      } catch {
        setShelf({ system, games: [], loading: false });
      }
    },
    [say],
  );

  const closeShelf = useCallback(() => setShelf(null), []);

  const scan = useCallback(async () => {
    if (!shelf || scanning) return;
    setScanning(true);
    try {
      const result = await window.nest.scan(shelf.system.id);
      if (!result.ok) {
        if (result.error !== 'cancelled') say(`扫描失败：${result.error}`);
      } else {
        const games = await window.nest.games(shelf.system.id);
        setShelf({ ...shelf, games, loading: false });
        setShelfIndex(0);
        say(`新增 ${result.added ?? 0} 个，重复 ${result.skipped ?? 0} 个`);
        void refreshHome();
      }
    } finally {
      setScanning(false);
    }
  }, [shelf, scanning, say, refreshHome]);

  const removeGame = useCallback(
    async (game: GameRecord) => {
      setMenu(null);
      const result = await window.nest.removeGame(game.id);
      if (!result.ok) {
        say('移除失败');
        return;
      }
      say(`已从库中移除 ${game.title}`);
      if (shelf) {
        const games = await window.nest.games(shelf.system.id);
        setShelf({ ...shelf, games });
        setShelfIndex(0);
      }
      void refreshHome();
    },
    [say, shelf, refreshHome],
  );

  const openRename = useCallback((game: GameRecord) => {
    setMenu(null);
    setRename({ game, text: game.title });
  }, []);

  const commitRename = useCallback(async () => {
    if (!rename) return;
    const title = rename.text.trim();
    if (!title) return;
    const result = await window.nest.renameGame(rename.game.id, title).catch(() => null);
    if (!result?.ok) {
      say('重命名失败');
      return;
    }
    setRename(null);
    say('已重命名');
    if (shelf && result.game) {
      setShelf({ ...shelf, games: shelf.games.map((g) => (g.id === result.game!.id ? result.game! : g)) });
    }
    void refreshHome();
  }, [rename, shelf, say, refreshHome]);

  const setCustomCover = useCallback(
    async (game: GameRecord) => {
      setMenu(null);
      const result = await window.nest.pickCover(game.id).catch(() => null);
      if (!result || result.canceled) return;
      if (!result.ok || !result.game) {
        say('设置自定义封面失败');
        return;
      }
      say('已设置自定义封面：自动截图不会再覆盖它');
      if (shelf) {
        setShelf({
          ...shelf,
          games: shelf.games.map((g) => (g.id === result.game!.id ? result.game! : g)),
        });
      }
    },
    [say, shelf],
  );

  const restoreAutoCover = useCallback(
    async (game: GameRecord) => {
      setMenu(null);
      const result = await window.nest.clearCover(game.id).catch(() => null);
      if (!result?.ok || !result.game) {
        say('恢复自动封面失败');
        return;
      }
      say('已恢复自动截图封面（下次启动游戏时重新截图）');
      if (shelf) {
        setShelf({
          ...shelf,
          games: shelf.games.map((g) => (g.id === result.game!.id ? result.game! : g)),
        });
      }
    },
    [say, shelf],
  );

  const moveShelf = useCallback(
    (dx: number, dy: number) => {
      if (!shelf || shelf.games.length === 0) return;
      setShelfIndex((prev) => {
        const total = shelf.games.length;
        if (dx !== 0) return (prev + dx + total) % total;
        const next = prev + dy * SHELF_COLUMNS;
        if (next < 0 || next >= total) return prev;
        return next;
      });
    },
    [shelf],
  );

  /* --------------------------------------------------------- launching */
  const openCheats = useCallback(async (game: GameRecord) => {
    setMenu(null);
    setCheat({ game, text: '', path: '', managed: false, busy: true });
    try {
      const res = await window.nest.gbaCheats(game.path);
      setCheat({ game, text: res.text, path: res.path, managed: res.managed, busy: false });
    } catch (err) {
      setCheat({
        game,
        text: '',
        path: '',
        managed: false,
        busy: false,
        error: (err as Error).message,
      });
    }
  }, []);

  const saveCheats = useCallback(async () => {
    if (!cheat || cheat.busy) return;
    setCheat({ ...cheat, busy: true, error: undefined });
    try {
      const res = await window.nest.gbaCheatsSave(cheat.game.path, cheat.text);
      if (!res.ok) throw new Error(res.error ?? '保存失败');
      setCheat({ ...cheat, path: res.path, managed: res.managed, busy: false });
      say(`金手指已保存：${cheat.game.title}（mGBA 启动时自动加载）`);
    } catch (err) {
      setCheat({ ...cheat, busy: false, error: (err as Error).message });
    }
  }, [cheat, say]);

  const confirmDialog = useCallback(async () => {
    if (!dialog) return;
    const { system, mode, game } = dialog;
    setDialog(null);
    setOverlay({
      name: game ? game.title : system.name,
      meta: game
        ? `正在启动 · ${engineLabel(system.engine)}`
        : mode === 'system'
          ? `正在开机 · ${system.systemMode ?? '系统模式'}`
          : `正在启动 · ${engineLabel(system.engine)}`,
    });
    const result = await window.nest.launch(system.id, mode, game?.path);
    if (!result.ok) {
      setOverlay(null);
      const map: Record<string, string> = {
        'engine-not-installed': `未找到 ${engineLabel(system.engine)}，请先安装或指定路径`,
        'engine-manifest-missing': `缺少 ${engineLabel(system.engine)} 的引擎清单`,
        'not-supported': '该主机尚未接入',
        'already-running': '已有一个会话在运行',
        'missing-ipl': '缺少对应区域的 GameCube IPL.bin（放到 .profile/dolphin/GC/USA|JAP|EUR）',
        'missing-wii-menu': '缺少 wii-menu.wad：请在「设置 → 系统文件（自备）」中导入自备的 Wii 系统菜单',
        'libretro-host-missing': '本安装包缺少 libretro 宿主或核心，无法启动 Wii Menu，请更新或重装 Nest',
        'libretro-not-ready': 'libretro 运行目录准备失败，请查看 nest.log',
        'missing-dsi-firmware': '缺少 DSi 固件：请到「设置 → 系统文件（自备）」导入 DSi BIOS + 固件 + NAND',
        'missing-wiiu-mlc': '缺少 Wii U NAND（MLC）：请到「设置 → 系统文件（自备）」选择 MLC 目录',
        'invalid-wiiu-mlc': 'Wii U NAND 目录无效：缺少 sys/title/00050010/10040000 或 usr/',
        'missing-cemu-keys': '缺少 Cemu keys.txt：请到「设置 → 系统文件（自备）」导入自备密钥',
        'bad-size-ps1-bios': 'PS1 BIOS 应为 512 KB（scph5500/scph5501/scph5502）',
        'bad-size-ps2-bios': 'PS2 BIOS 应为 4 MB（scph39001 等）',
        'invalid-psp-flash0': '目录里没有 vsh/module/vshmain.prx，不是有效的 PSP flash0',
        'psp-flash0-io-error': '导入 PSP 固件失败：检查目标目录权限',
        'missing-ppsspp': '找不到内置 PPSSPP 引擎',
        'missing-ps2-bios': '缺少 PS2 BIOS：请到「设置 → PlayStation」导入自备的 PS2 BIOS',
        'missing-psp-firmware': '缺少 PSP 固件：请在 PPSSPP 里安装 6.61 固件后再启动 XMB',
        'missing-3ds-system-files':
          '3DS HOME Menu 需要 Azahar 系统文件：请先用真机 + Artic Setup Tool 在 Azahar 里执行 Set Up System Files',
        'missing-xbox-firmware':
          'xemu 需要自备 Xbox 固件：请到「设置 → Xbox」导入 MCPX（512 B）、BIOS（256 KB）和 HDD 镜像（qcow2）',
        'bad-size-xbox-mcpx': 'MCPX boot ROM 必须是 512 字节',
        'bad-size-xbox-bios': 'Xbox BIOS 必须是 256 KB 的 flash dump（1 MB 的四连体镜像会自动取第一段）',
        'bad-size-xbox-hdd': 'HDD 镜像无效：需要 xemu 的 xbox_hdd.qcow2（qcow2 头 QFI）',
        'xbox-hdd-io-error': 'HDD 镜像读取失败：检查文件权限',
        'missing-rom': '没有可启动的游戏文件',
      };
      say(map[result.error ?? ''] ?? `启动失败（${result.error}）`);
      return;
    }
    window.setTimeout(() => setOverlay(null), 1800);
  }, [dialog, say]);

  const toggleFav = useCallback(async () => {
    if (!selectedSystem) return;
    const next = !favorites.has(selectedSystem.id);
    setFavorites((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(selectedSystem.id);
      else copy.delete(selectedSystem.id);
      return copy;
    });
    say(next ? `已收藏 ${selectedSystem.name}` : '已取消收藏');
    await window.nest.favorite(selectedSystem.id, next).catch(() => undefined);
  }, [favorites, selectedSystem, say]);

  const move = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      const index = rows.findIndex((r) =>
        r.kind === sel.type ? (r.kind === 'family' ? r.family.id === sel.id : r.system.id === sel.id) : false,
      );
      const next = rows[(index + delta + rows.length) % rows.length];
      if (!next) return;
      select(next.kind === 'family' ? 'family' : 'system', next.kind === 'family' ? next.family.id : next.system.id);
    },
    [rows, sel, select],
  );

  /* -------------------------------------------------------- keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;

      // The cheat editor is a plain textarea: never treat its keystrokes as
      // navigation shortcuts (Escape is handled by the dialog itself).
      if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return;

      if (menu) {
        if (k === 'Escape') {
          e.preventDefault();
          setMenu(null);
        }
        return;
      }

      // Key capture wins over every shortcut, including the Esc that would
      // otherwise close the settings dialog.
      if (keyCapture) {
        captureKey(e);
        return;
      }

      if (settingsOpen) {
        if (k === 'Escape' || k === 'b' || k === 'B') {
          e.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }

      if (dialog) {
        if (k === 'Escape' || k === 'b' || k === 'B') {
          e.preventDefault();
          setDialog(null);
        } else if (k === 'a' || k === 'A') {
          e.preventDefault();
          void confirmDialog();
        }
        return;
      }

      if (shelf) {
        if (k === 'Escape' || k === 'b' || k === 'B') {
          e.preventDefault();
          closeShelf();
        } else if (k === 'ArrowRight') {
          e.preventDefault();
          moveShelf(1, 0);
        } else if (k === 'ArrowLeft') {
          e.preventDefault();
          moveShelf(-1, 0);
        } else if (k === 'ArrowDown') {
          e.preventDefault();
          moveShelf(0, 1);
        } else if (k === 'ArrowUp') {
          e.preventDefault();
          moveShelf(0, -1);
        } else if (k === 'Enter' || k === ' ' || k === 'a' || k === 'A') {
          e.preventDefault();
          const game = shelf.games[shelfIndex];
          if (game) askEnter(shelf.system, 'game', game);
        }
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(k)) e.preventDefault();

      const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON';

      if (k === 'ArrowUp') move(-1);
      else if (k === 'ArrowDown') move(1);
      else if (k === 'ArrowLeft') {
        if (sel.type === 'system') {
          const row = rows.find((r) => r.kind === 'system' && r.system.id === sel.id);
          if (row && row.kind === 'system') select('family', row.family.id);
        } else if (expanded.has(sel.id)) {
          toggleFamily(sel.id);
        }
      } else if (k === 'ArrowRight') {
        if (sel.type === 'family' && !expanded.has(sel.id)) {
          toggleFamily(sel.id);
          const family = families.find((f) => f.id === sel.id);
          if (family?.systems[0]) select('system', family.systems[0].id);
        }
      } else if (k === 'Enter' || k === ' ' || k === 'a' || k === 'A') {
        if (onButton && (k === 'Enter' || k === ' ')) return;
        if (sel.type === 'family') toggleFamily(sel.id);
        else if (selectedSystem) void openShelf(selectedSystem);
      } else if (k === 'x' || k === 'X') {
        if (selectedSystem?.systemMode) askEnter(selectedSystem, 'system');
        else if (selectedSystem) say(`${selectedSystem.name} 没有系统模式`);
      } else if (k === 'y' || k === 'Y') {
        void toggleFav();
      } else if (k === 'Escape' || k === 'b' || k === 'B') {
        if (overlay) setOverlay(null);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    dialog,
    settingsOpen,
    menu,
    shelf,
    shelfIndex,
    move,
    sel,
    expanded,
    families,
    rows,
    selectedSystem,
    askEnter,
    confirmDialog,
    overlay,
    say,
    toggleFav,
    toggleFamily,
    select,
    moveShelf,
    closeShelf,
    openShelf,
    keyCapture,
    captureKey,
  ]);

  /* ----------------------------------------------------------- render */
  const year = selectedSystem?.year;
  const ghostLabel = (
    sel.type === 'family' ? selectedFamily?.name ?? '' : selectedSystem?.name ?? ''
  ).toUpperCase();

  // Debug hook: the `--dump` switch in main reads this to verify what the
  // renderer actually received from IPC.
  (window as unknown as Record<string, unknown>).__NEST_STATE__ = {
    sel,
    empty,
    image: selectedSystem?.image ?? null,
    engine: selectedSystem?.engine ?? null,
    families: families.length,
    systems: families.reduce((n, f) => n + f.systems.length, 0),
    shelf: shelf ? shelf.games.length : null,
  };

  // Used by `--shelf=<id>` screenshots: opens a library without touching the UI.
  (window as unknown as Record<string, unknown>).__NEST_OPEN_SHELF__ = (id: string) => {
    const target = families.flatMap((f) => f.systems).find((s) => s.id === id);
    if (target) void openShelf(target);
  };

  (window as unknown as Record<string, unknown>).__NEST_SELECT__ = (id: string) => {
    const target = families.flatMap((f) => f.systems).find((s) => s.id === id);
    if (target) setSel({ type: 'system', id: target.id });
  };

  (window as unknown as Record<string, unknown>).__NEST_SAY__ = (text: string) => say(text);

  // Used by `--expand=<family>` screenshots: expand a family row.
  (window as unknown as Record<string, unknown>).__NEST_EXPAND__ = (id: string) => {
    setExpanded((prev) => new Set(prev).add(id));
  };

  // Used by `--stab=<id>` screenshots: switch the settings tab without clicking.
  (window as unknown as Record<string, unknown>).__NEST_SETTINGS_TAB__ = (id: string) => {
    if (SETTINGS_TABS.some((tab) => tab.id === id)) setSettingsTab(id as SettingsTab);
  };

  // Used by `--keysystem=<id>` screenshots: focus one console's key panel.
  (window as unknown as Record<string, unknown>).__NEST_KEY_SYSTEM__ = (id: string) => {
    if (KEY_SYSTEMS.some((system) => system.id === id)) {
      keySystemPinned.current = true;
      setSettingsTab('playstation');
      setKeySystemId(id as SystemId);
    }
  };

  // Used by `--cheat` screenshots: open the cheat editor for the first GBA game.
  (window as unknown as Record<string, unknown>).__NEST_OPEN_CHEAT__ = () => {
    const game = shelf?.games.find((g) => systemById.get(g.systemId as SystemId)?.engine === 'mgba');
    if (game) void openCheats(game);
  };

  const keySystemsVisible = KEY_SYSTEMS.filter((system) => {
    if (settingsTab === 'playstation') return isPlaystationEngine(system.engine);
    if (settingsTab === 'xbox') return isXboxEngine(system.engine);
    return !isPlaystationEngine(system.engine) && !isXboxEngine(system.engine);
  });

  const renderKeys = () => (
<div className="settings-col keys-col">
                  <h2>键位</h2>
                  <p className="dlg-note">
                    改的是引擎的键盘绑定，保存后立即生效；同一引擎的多台主机共用一套键位。
                  </p>

                  <div className="key-engines" role="group" aria-label="选择主机">
                    {keySystemsVisible.map((system) => (
                      <button
                        key={system.id}
                        className={`key-engine${system.id === keySystem.id ? ' on' : ''}`}
                        title={`${system.name} · ${engineLabel(system.engine)}`}
                        onClick={() => pickKeySystem(system.id)}
                      >
                        {system.short}
                      </button>
                    ))}
                  </div>

                  {keyView ? (
                    <>
                      <div className="key-meta">
                        <span>
                          {engineLabel(keyEngine)} · {keyView.mode === 'gamepad' ? '手柄模式' : '键盘模式'}
                          {keyShared.length > 1 ? ` · ${keyShared.join(' / ')} 共用` : ''}
                        </span>
                        <small className={keyDirty ? 'dirty' : ''}>
                          {!keyView.supported
                            ? '暂不支持'
                            : keyDirty
                              ? '有未保存改动'
                              : keyView.isCustom
                                ? '已自定义'
                                : '默认键位'}
                        </small>
                      </div>

                      {!keyView.supported ? (
                        <div className="key-unsupported">
                          <p>该引擎键位格式尚未支持</p>
                          <span>先用手柄，或进 {engineLabel(keyEngine)} 自己的设置里改键。</span>
                        </div>
                      ) : null}

                      <div className={`key-group${keySupported ? '' : ' disabled'}`}>
                        {PAD_ACTIONS.map((action) => {
                          const code = keyBindings[action];
                          const capturing = keyCapture === action;
                          return (
                            <div className={`key-row${capturing ? ' capturing' : ''}`} key={action}>
                              <span className="key-name">{ACTION_LABEL[action]}</span>
                              <span className={`key-badge${code ? '' : ' empty'}`}>
                                {capturing ? '请按键…' : prettyKey(code)}
                              </span>
                              <button
                                className="key-edit"
                                disabled={!keySupported || keyBusy !== null}
                                onClick={(event) => {
                                  // Blur so the Space/Enter used to pick a key does not
                                  // also re-activate this button on keyup.
                                  event.currentTarget.blur();
                                  if (capturing) {
                                    setKeyCapture(null);
                                    setKeyCaptureError(null);
                                    return;
                                  }
                                  setKeyCapture(action);
                                  setKeyCaptureError(null);
                                }}
                              >
                                {capturing ? '取消' : '改'}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {keyCapture ? (
                        <p className="key-hint">
                          按下要绑定的键 · Esc 取消
                          {keyCaptureError ? ` · ${keyCaptureError}` : ''}
                        </p>
                      ) : keyCaptureError ? (
                        <p className="key-hint err">{keyCaptureError}</p>
                      ) : null}

                      <div className="key-actions">
                        <button
                          className="ghost-btn"
                          disabled={!keySupported || keyBusy !== null}
                          onClick={() => void resetKeys()}
                        >
                          {keyBusy === 'reset' ? '恢复中…' : '恢复默认'}
                        </button>
                        <button
                          className="dlg-btn primary"
                          disabled={!keySupported || !keyDirty || keyBusy !== null}
                          onClick={() => void saveKeys()}
                        >
                          {keyBusy === 'save' ? '保存中…' : '保存'}
                        </button>
                      </div>
                    </>
                  ) : controlsFailed ? (
                    <p className="key-hint err">
                      键位数据读取失败；等主进程的 controls IPC 就绪后重新打开设置。
                    </p>
                  ) : (
                    <p className="key-hint">读取中…</p>
                  )}
                </div>
  );


  return (
    <div
      className={`stage${empty ? ' empty' : ''}${shelf ? ' shelf-open' : ''}`}
      ref={stageRef}
      onPointerMove={onPointerMove}
    >
      <div className="dragbar" />

      <div className="photo-stage">
        <div className="photo-glow" />
        <div className={`yearmark${sel.type === 'family' ? ' off' : ''}`}>
          <span>RELEASED</span>
          <b>{sel.type === 'family' ? '—' : year ?? '—'}</b>
        </div>
        <div className={`layer${front === 0 ? ' on' : ''}`}>
          <img src={imgs[0]} alt="" draggable={false} />
        </div>
        <div className={`layer${front === 1 ? ' on' : ''}`}>
          <img src={imgs[1]} alt="" draggable={false} />
        </div>
        <div className="ghost">
          {ghostLabel}
          <small>{sel.type === 'family' ? '预留平台 · 适配器就位后启用' : `预留入口 · ${engineLabel(selectedSystem?.engine)}`}</small>
        </div>
      </div>

      <div className="vignette" />
      <div className="grain" />

      <aside className="rail">
        <header className="brand">
          <svg className="mark" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
            <g transform="rotate(-11 16 17)">
              <rect x="5.4" y="20.4" width="21.2" height="3.7" rx="1.85" />
              <rect x="8.2" y="14.3" width="15.6" height="3.7" rx="1.85" opacity=".6" />
              <rect x="11" y="8.2" width="10" height="3.7" rx="1.85" opacity=".3" />
            </g>
          </svg>
          <div>
            <span className="brand-name">NEST</span>
            <span className="brand-sub">SIMULATOR STATION</span>
          </div>
        </header>

        <nav className="tree" role="tree" aria-label="主机导航">
          {rows.map((row) =>
            row.kind === 'family' ? (
              <button
                key={`f-${row.family.id}`}
                className={`row family${sel.type === 'family' && sel.id === row.family.id ? ' sel' : ''}${
                  expanded.has(row.family.id) ? ' open' : ''
                }`}
                onPointerEnter={() => select('family', row.family.id)}
                onClick={() => {
                  select('family', row.family.id);
                  toggleFamily(row.family.id);
                }}
              >
                <span className="chev" />
                <span>{row.family.name}</span>
                <span className="count">{row.family.systems.length}</span>
              </button>
            ) : (
              <button
                key={`s-${row.system.id}`}
                className={`row console${sel.type === 'system' && sel.id === row.system.id ? ' sel' : ''}${
                  row.system.state === 'locked' ? ' locked' : ''
                }${runningSystems[row.system.id] ? ' running' : ''}`}
                onPointerEnter={() => select('system', row.system.id)}
                onClick={() => select('system', row.system.id)}
                onDoubleClick={() => void openShelf(row.system)}
              >
                <span className="label">{row.system.name}</span>
                {runningSystems[row.system.id] ? <span className="run-dot" title="运行中" /> : null}
                <span className="short">
                  {favorites.has(row.system.id) ? '★ ' : ''}
                  {row.system.short}
                </span>
              </button>
            ),
          )}
        </nav>

        <footer className="rail-foot">
          <button className="ghost-btn" onClick={openSettings}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
              <circle cx="9" cy="7" r="2.1" fill="#08080a" />
              <circle cx="15" cy="12" r="2.1" fill="#08080a" />
              <circle cx="8" cy="17" r="2.1" fill="#08080a" />
            </svg>
            设置
          </button>
        </footer>
      </aside>

      <section className="info" key={sel.type + sel.id} aria-live="polite">
        {sel.type === 'family' && selectedFamily ? (
          <>
            <div className="tag">
              <span className={`dot${selectedFamily.locked ? ' off' : ''}`} />
              {selectedFamily.locked ? '预留平台' : '平台'}
            </div>
            <h1>{selectedFamily.name}</h1>
            <p className="sub">
              {selectedFamily.systems.length} 个系统{selectedFamily.locked ? ' · 尚未接入' : ' · 已接入'}
            </p>
            <p className="note">
              {selectedFamily.locked ? '入口已预留，适配器就位后即可启用。' : '按 Enter 展开 / 收起主机列表。'}
            </p>
            <div className="keys">
              <span className="key static">
                <kbd>↑</kbd>
                <kbd>↓</kbd>选择
              </span>
              <span className="key static">
                <kbd>←</kbd>
                <kbd>→</kbd>收起 / 展开
              </span>
            </div>
          </>
        ) : selectedSystem ? (
          <>
            <div className="tag">
              <span
                className={`dot${selectedSystem.state === 'warn' ? ' warn' : ''}${
                  selectedSystem.state === 'locked' ? ' off' : ''
                }`}
              />
              {selectedSystem.state === 'locked'
                ? '预留入口 · 尚未接入'
                : selectedSystem.state === 'warn'
                  ? '需要配置'
                  : '引擎就绪'}
            </div>
            <h1>{selectedSystem.name}</h1>
            {runningSystems[selectedSystem.id] ? (
              <p className="run-line">
                <span className="run-dot" />
                运行中{runningSystems[selectedSystem.id] > 1 ? ` ×${runningSystems[selectedSystem.id]}` : ''}
              </p>
            ) : null}
            <p className="sub">
              {activeModel ? activeModel.year : selectedSystem.year} · {selectedSystem.kind} ·{' '}
              {engineLabel(selectedSystem.engine)}
            </p>
            {selectedSystem.note ? <p className="note">{selectedSystem.note}</p> : null}

            {ndsModels.length > 0 ? (
              <div className="models">
                {NDS_MODEL_GROUPS.map((group) => (
                  <div className="model-group" key={group.title}>
                    <span className="model-title">{group.title}</span>
                    <div className="model-row">
                      {group.models.map((modelId) => {
                        const model = ndsModels.find((entry) => entry.id === modelId);
                        if (!model) return null;
                        return (
                          <button
                            key={model.id}
                            className={`model-chip${activeModel?.id === model.id ? ' is-on' : ''}`}
                            onClick={() => void updateSetting({ ndsModel: model.id })}
                          >
                            {model.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedSystem.state === 'locked' ? (
              <div className="keys">
                <button className="key" onClick={() => say(`已加入愿望单 · ${selectedSystem.name}`)}>
                  <kbd>Y</kbd>加入愿望单
                </button>
                <button className="key" onClick={() => say('返回')}>
                  <kbd>B</kbd>返回
                </button>
              </div>
            ) : (
              <>
                <div className="stats">
                  <div className="stat">
                    <b>{selectedSystem.games}</b>
                    <span>Games</span>
                  </div>
                  <div className="stat">
                    <b>{selectedSystem.saves}</b>
                    <span>Saves</span>
                  </div>
                  <div className="stat">
                    <b>{displayLastPlayed(selectedSystem.lastPlayed ?? null)}</b>
                    <span>Last played</span>
                  </div>
                </div>
                <div className="keys">
                  <button className="key" onClick={() => void openShelf(selectedSystem)}>
                    <kbd>A</kbd>进入
                  </button>
                  {selectedSystem.systemMode ? (
                    <button className="key" onClick={() => askEnter(selectedSystem, 'system')}>
                      <kbd>X</kbd>
                      {selectedSystem.systemMode.includes('故障')
                        ? '系统模式（故障）'
                        : selectedSystem.systemMode.includes('需固件')
                          ? '系统模式（需固件）'
                          : '系统模式'}
                    </button>
                  ) : null}
                  <button
                    className={`key${favorites.has(selectedSystem.id) ? ' is-on' : ''}`}
                    onClick={() => void toggleFav()}
                  >
                    <kbd>Y</kbd>
                    {favorites.has(selectedSystem.id) ? '已收藏' : '收藏'}
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}
      </section>

      <div className="timeline">
        <div className="tl-cap">TIMELINE / {selectedFamily?.name.toUpperCase() ?? 'NINTENDO'}</div>
        <div
          className="tl-track"
          style={{ maxWidth: `${Math.max(240, (selectedFamily?.systems.length ?? 0) * 82)}px` }}
        >
          <div className="tl-rule" />
          {(selectedFamily?.systems ?? []).map((system, i, list) => {
            const duplicate = i > 0 && list[i - 1].year === system.year;
            return (
              <button
                key={system.id}
                className={`tl-item${sel.type === 'system' && sel.id === system.id ? ' on' : ''}`}
                title={`${system.name} · ${system.year}`}
                onClick={() => select('system', system.id)}
              >
                <i />
                <span>{duplicate ? '' : system.year}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shelf ? (
        <section className="shelf" aria-label={`${shelf.system.name} 游戏库`}>
          <header className="shelf-head">
            <button className="shelf-back" onClick={closeShelf}>
              <kbd>B</kbd>返回
            </button>
            <div className="shelf-title">
              <h2>{shelf.system.name}</h2>
              <span>
                {shelf.loading ? '读取中…' : `${shelf.games.length} 个游戏`} · {engineLabel(shelf.system.engine)}
              </span>
            </div>
            <button className="shelf-scan" onClick={() => void scan()} disabled={scanning}>
              {scanning ? '扫描中…' : '扫描文件夹'}
            </button>
          </header>

          <div className={`shelf-grid${shelf.games.length === 0 ? ' empty' : ''}`}>
            {shelf.games.map((game, index) => (
              <button
                key={game.id}
                className={`card${index === shelfIndex ? ' on' : ''}${runningGames[game.id] ? ' running' : ''}`}
                onPointerEnter={() => setShelfIndex(index)}
                onClick={() => askEnter(shelf.system, 'game', game)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const menuWidth = 208;
                  const mgba = systemById.get(game.systemId as SystemId)?.engine === 'mgba';
                  const menuHeight = (mgba ? 148 : 92) + 44 + (game.coverCustom ? 44 : 0);
                  setMenu({
                    x: Math.min(e.clientX, window.innerWidth - menuWidth - 12),
                    y: Math.min(e.clientY, window.innerHeight - menuHeight - 12),
                    game,
                  });
                }}
              >
                <span className="card-art">
                  {game.coverUrl ? (
                    <img src={game.coverUrl} alt="" draggable={false} />
                  ) : (
                    <i>{(game.title[0] ?? '?').toUpperCase()}</i>
                  )}
                  {runningGames[game.id] ? <span className="run-badge">运行中</span> : null}
                </span>
                <span className="card-title">{game.title}</span>
                <span className="card-meta">
                  {formatSize(game.size)} · {relativeTime(game.lastPlayed)}
                  {game.region ? ` · ${game.region}` : ''}
                </span>
              </button>
            ))}

            {!shelf.loading && shelf.games.length === 0 ? (
              <div className="shelf-empty">
                <p>这个主机还没有游戏</p>
                <span>把 ROM 放进一个文件夹，点右上角「扫描文件夹」</span>
              </div>
            ) : null}
          </div>

          <footer className="shelf-foot">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd>
              <kbd>←</kbd>
              <kbd>→</kbd> 选择
            </span>
            <span>
              <kbd>A</kbd> 启动
            </span>
            <span>
              <kbd>B</kbd> 返回
            </span>
          </footer>
        </section>
      ) : null}

      {menu ? (
        <div
          className="ctx-layer"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            {systemById.get(menu.game.systemId as SystemId)?.engine === 'mgba' ? (
              <button className="ctx-item" onClick={() => void openCheats(menu.game)}>
                <span className="ctx-label">金手指…</span>
                <span className="ctx-hint">mGBA .cheats 文件</span>
              </button>
            ) : null}
            <button className="ctx-item" onClick={() => openRename(menu.game)}>
              <span className="ctx-label">重命名…</span>
              <span className="ctx-hint">只改显示名，不改文件名</span>
            </button>
            <button className="ctx-item" onClick={() => void setCustomCover(menu.game)}>
              <span className="ctx-label">自定义封面…</span>
              <span className="ctx-hint">自动截图不再覆盖</span>
            </button>
            {menu.game.coverCustom ? (
              <button className="ctx-item" onClick={() => void restoreAutoCover(menu.game)}>
                <span className="ctx-label">恢复自动封面</span>
                <span className="ctx-hint">下次启动时重新截图</span>
              </button>
            ) : null}
            <button className="ctx-item" onClick={() => void removeGame(menu.game)}>
              <span className="ctx-label">从库中移除</span>
              <span className="ctx-hint">不删除磁盘上的文件</span>
            </button>
          </div>
        </div>
      ) : null}

      {rename ? (
        <div className="dialog open" role="dialog" aria-modal="true" onClick={() => setRename(null)}>
          <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
            <div className="dlg-tag">
              <i />重命名
            </div>
            <h2>重命名游戏</h2>
            <p>只改 Nest 库里的显示名，不会改磁盘上的文件名。</p>
            <input
              className="dlg-input"
              autoFocus
              maxLength={120}
              value={rename.text}
              onChange={(event) => setRename({ ...rename, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitRename();
                if (event.key === 'Escape') setRename(null);
              }}
            />
            <div className="dlg-actions">
              <button className="dlg-btn" onClick={() => setRename(null)}>
                取消
              </button>
              <button className="dlg-btn primary" disabled={!rename.text.trim()} onClick={() => void commitRename()}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`toast${toast ? ' on' : ''}`}>{toast ?? ''}</div>

      <div className={`launch${overlay ? ' on' : ''}`}>
        <div className="launch-inner">
          <div className="launch-name">{overlay?.name ?? ''}</div>
          <div className="launch-meta">{overlay?.meta ?? ''}</div>
          <div className="bar">
            <i />
          </div>
        </div>
      </div>

      <div
        className={`dialog${cheat ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={() => setCheat(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setCheat(null);
          }
        }}
      >
        <div className="dialog-card cheat-card" onClick={(e) => e.stopPropagation()}>
          <div className="dlg-tag">
            <i />
            金手指
          </div>
          <h2>{cheat?.game.title ?? ''}</h2>
          <p className="dlg-note">
            mGBA 启动时会自动加载 ROM 旁边的 <code>.cheats</code> 文件，这里的内容会保存到
            {cheat?.managed ? ' Nest 数据目录（ROM 文件夹不可写）' : ' ROM 所在目录'}。
            支持 GameShark / Action Replay / CodeBreaker / PARv3，一行一条。
          </p>
          <textarea
            className="cheat-editor"
            spellCheck={false}
            value={cheat?.text ?? ''}
            placeholder={'# 一行一条\n# GameShark:  02025BC4:000F423F\n# CodeBreaker: 82000000 0000\n'}
            onChange={(e) => cheat && setCheat({ ...cheat, text: e.target.value })}
          />
          {cheat?.error ? <p className="key-hint err">保存失败：{cheat.error}</p> : null}
          {cheat && !cheat.managed && cheat.path ? (
            <p className="dlg-note">{cheat.path}</p>
          ) : null}
          <div className="cheat-actions">
            <button className="ghost-btn" onClick={() => setCheat(null)}>
              关闭
            </button>
            <button
              className="ghost-btn"
              disabled={cheat?.busy}
              onClick={() => cheat && setCheat({ ...cheat, text: '' })}
            >
              清空
            </button>
            <button
              className="dlg-btn primary"
              disabled={cheat?.busy}
              onClick={() => void saveCheats()}
            >
              {cheat?.busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>

      <div className={`dialog${settingsOpen ? ' open' : ''}`} role="dialog" aria-modal="true">
        <div className="dialog-card settings-card">
          <div className="dlg-tag">
            <i />
            设置
          </div>

          <div className="settings-shell">
            <nav className="settings-nav" aria-label="设置分类">
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`settings-tab${settingsTab === tab.id ? ' on' : ''}`}
                  onClick={() => setSettingsTab(tab.id)}
                >
                  <span>{tab.name}</span>
                  <small>{tab.hint}</small>
                </button>
              ))}
            </nav>

            <div className="settings-body">
              {settingsTab === 'nest' ? (
                <div className="settings-panel">
                        <h2>启动与画面</h2>
                        <p className="dlg-note">这些偏好保存在本机的库文件里，换主机不影响。</p>

                        <label className="toggle-row">
                          <span>
                            启动引擎时最小化主窗口
                            <small>引擎退出后自动还原并聚焦</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={settings.minimizeOnLaunch}
                            onChange={(e) => void updateSetting({ minimizeOnLaunch: e.target.checked })}
                          />
                          <i className="switch" />
                        </label>

                        <label className="toggle-row">
                          <span>
                            全屏启动引擎
                            <small>把引擎自己支持的全屏参数传给它</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={settings.fullscreen}
                            onChange={(e) => void updateSetting({ fullscreen: e.target.checked })}
                          />
                          <i className="switch" />
                        </label>


              <h2>游戏文件夹（自动扫描）</h2>
                        <p className="dlg-note">
                          添加过的文件夹会记住；启动 Nest 时自动重扫，新放进来的 ROM 就会出现在游戏库里。
                        </p>

                        <label className="toggle-row">
                          <span>
                            启动时自动重新扫描
                            <small>关掉后只在点「立即扫描」或打开游戏库时扫描</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={settings.autoScan !== false}
                            onChange={(e) => void updateSetting({ autoScan: e.target.checked })}
                          />
                          <i className="switch" />
                        </label>

                        {(settings.scanRoots ?? []).length === 0 ? (
                          <p className="dlg-note">还没有添加文件夹，点「添加文件夹…」选一个放 ROM 的目录。</p>
                        ) : (
                          (settings.scanRoots ?? []).map((root) => (
                            <div className="scan-root" key={root}>
                              <span title={root}>{root}</span>
                              <button className="ghost-btn" onClick={() => void removeRoot(root)}>
                                移除
                              </button>
                            </div>
                          ))
                        )}

                        <div className="scan-actions">
                          <button className="ghost-btn" onClick={() => void addFolder()}>
                            添加文件夹…
                          </button>
                          <button className="ghost-btn" disabled={rescanning} onClick={() => void rescanAll()}>
                            {rescanning ? '扫描中…' : '立即扫描'}
                          </button>
                        </div>
                </div>
              ) : settingsTab === 'nintendo' ? (
                <div className="settings-cols">
                  <div className="settings-col">
                        <h2>系统文件（自备）</h2>
                        <p className="dlg-note">
                          IPL / WAD 需要你自己从主机 dump，Nest 不打包也不下载；导入后会复制到本机数据目录。
                        </p>

                        {firmware
                          .filter(
                            (item) =>
                              item.kind !== 'ps1-bios' &&
                              item.kind !== 'ps2-bios' &&
                              item.kind !== 'psp-firmware' &&
                              item.kind !== 'xbox-mcpx' &&
                              item.kind !== 'xbox-bios' &&
                              item.kind !== 'xbox-hdd',
                          )
                          .map((item) => (
                          <div className="fw-row" key={item.kind}>
                            <span>
                              {item.label}
                              {item.kind === 'wiiu-mlc' ? (
                                <button
                                  type="button"
                                  className="tip-btn"
                                  title="关于 Wii U NAND（MLC）"
                                  onClick={() => setMlcTipOpen((v) => !v)}
                                >
                                  ?
                                </button>
                              ) : null}
                              <small>
                                {item.status === 'ok'
                                  ? item.kind === 'wiiu-mlc'
                                    ? '已设置'
                                    : item.kind === 'cemu-keys'
                                      ? '已导入'
                                      : '已就绪'
                                  : item.status === 'invalid'
                                    ? item.kind === 'wiiu-mlc'
                                      ? '目录无效'
                                      : item.kind === 'cemu-keys'
                                        ? '没有有效密钥'
                                        : '校验未通过'
                                    : item.kind === 'wiiu-mlc'
                                      ? '未设置'
                                      : '未导入'}
                                {item.detail ? ` · ${item.detail}` : ''}
                              </small>
                            </span>
                            <button className="ghost-btn" onClick={() => void importFirmware(item.kind)}>
                              {item.kind === 'wiiu-mlc' || item.kind === 'dsi-firmware' ? '选择目录…' : '选择文件…'}
                            </button>
                          </div>
                        ))}

                        {mlcTipOpen ? (
                          <p className="dlg-note tip-note">
                            Wii U NAND（MLC）可以来自：① 你自己的 Wii U 真机 dump（推荐）；②
                            和本项目一样，用任天堂 CDN 的系统 title 手工拼装（流程见仓库
                            docs/nintendo/WIIU-CDN-MLC.md，需自备 keys.txt）。
                            <br />
                            注意：Cemu 2.6 尚未实现 nn_act.LoadConsoleAccount，即使 MLC
                            正确，Wii U Menu 目前也只会停在背景画面，所以该功能标记为「实验性」。
                            游戏直读不受影响。
                          </p>
                        ) : null}

                        <p className="dlg-note">
                          3DS 系统模式入口已恢复：Azahar 能直接启动 HOME Menu，但需要先通过
                          真机 + Artic Setup Tool 安装 nand / sysdata 系统文件；未安装时启动会给出提示。
                        </p>

                        <label className="toggle-row">
                          <span>
                            NDS / DSi 系统菜单插入最近游戏
                            <small>进入系统模式时把最近玩的 NDS 游戏当作卡带插入；关掉则菜单里没有卡带</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={settings.ndsSystemInsert !== false}
                            onChange={(e) => void updateSetting({ ndsSystemInsert: e.target.checked })}
                          />
                          <i className="switch" />
                        </label>
                  </div>
                {renderKeys()}
                </div>

              ) : settingsTab === 'playstation' ? (
                <div className="settings-cols">
                  <div className="settings-col">
                    <h2>系统文件（自备）</h2>
                    <p className="dlg-note">
                      PS1 BIOS 可选（缺省用 OpenBIOS）；PS2 BIOS 必需；PSP XMB 需要 flash0 固件。
                      文件只复制/链接到本机数据目录，Nest 不打包也不下载。
                    </p>

                    {firmware
                      .filter((item) => item.kind === 'ps1-bios' || item.kind === 'ps2-bios' || item.kind === 'psp-firmware')
                      .map((item) => (
                        <div className="fw-row" key={item.kind}>
                          <span>
                            {item.label}
                            <small>
                              {item.status === 'ok'
                                ? '已导入'
                                : item.status === 'invalid'
                                  ? '校验未通过'
                                  : '未导入'}
                              {item.detail ? ` · ${item.detail}` : ''}
                            </small>
                          </span>
                          <button className="ghost-btn" onClick={() => void importFirmware(item.kind)}>
                            {item.kind === 'psp-firmware' ? '选择目录…' : '选择文件…'}
                          </button>
                        </div>
                      ))}

                    <button className="ghost-btn" onClick={() => void window.nest.openPpsspp()}>
                      打开 PPSSPP（安装 PSP 固件）
                    </button>
                    <p className="dlg-note">
                      PSP 固件有两种来源：已解密的 <code>flash0</code> 目录可直接「选择目录…」导入；
                      如果只有官方 6.61 升级程序 EBOOT.PBP，点上面的按钮打开 PPSSPP，在
                      设置 → 工具 → PSP 固件里安装一次，Nest 会自动识别同一个 memstick。
                    </p>

                    <h2>PS3 渲染器</h2>
                    <p className="dlg-note">
                      Vulkan 性能更好，OpenGL 兼容性更好；Crysis 3 在 Vulkan 下会被游戏自身的超时断言打断，
                      遇到崩溃先切 OpenGL 试试。
                    </p>
                    <div className="scan-actions">
                      <button
                        className={`ghost-btn${settings.ps3Renderer === 'vulkan' ? ' is-current' : ''}`}
                        onClick={() => void updateSetting({ ps3Renderer: 'vulkan' })}
                      >
                        Vulkan
                      </button>
                      <button
                        className={`ghost-btn${settings.ps3Renderer === 'vulkan' ? '' : ' is-current'}`}
                        onClick={() => void updateSetting({ ps3Renderer: 'opengl' })}
                      >
                        OpenGL
                      </button>
                    </div>
                    <button className="ghost-btn" onClick={() => void window.nest.openPs3Cache()}>
                      打开 PS3 预编译缓存位置
                    </button>
                    <p className="dlg-note">
                      当前：{settings.ps3Renderer === 'vulkan' ? 'Vulkan' : 'OpenGL'}；切换只改配置，不删除另一渲染器已编译的缓存，下次启动 PS3 游戏时生效。
                    </p>
                  </div>

                  {renderKeys()}
                </div>
              ) : (
                <div className="settings-cols">
                  <div className="settings-col">
                    <h2>系统文件（自备）</h2>
                    <p className="dlg-note">
                      Xbox 初代走 xemu 直读，需要三样自备文件：MCPX boot ROM（512 B）、256 KB 的 BIOS
                      flash dump、以及 HDD 镜像（xbox_hdd.qcow2）。Nest 只复制前两个小文件，HDD
                      仅记录路径、不复制（它是可写镜像）。Xbox 360 走 Xenia，不需要固件。
                    </p>

                    {firmware
                      .filter(
                        (item) =>
                          item.kind === 'xbox-mcpx' ||
                          item.kind === 'xbox-bios' ||
                          item.kind === 'xbox-hdd',
                      )
                      .map((item) => (
                        <div className="fw-row" key={item.kind}>
                          <span>
                            {item.label}
                            <small>
                              {item.status === 'ok'
                                ? item.kind === 'xbox-hdd'
                                  ? '已设置'
                                  : '已导入'
                                : item.status === 'invalid'
                                  ? '校验未通过'
                                  : item.kind === 'xbox-hdd'
                                    ? '未设置'
                                    : '未导入'}
                              {item.detail ? ` · ${item.detail}` : ''}
                            </small>
                          </span>
                          <button className="ghost-btn" onClick={() => void importFirmware(item.kind)}>
                            选择文件…
                          </button>
                        </div>
                      ))}

                    <p className="dlg-note">
                      Xbox 360 已接入 Xenia Canary：GOD / ISO / XEX 直读，无需固件，没有 Dashboard；
                      键位面板见右侧（Xenia [HID.Key]）。xemu 目前只支持 SDL 手柄，暂不提供键盘映射。
                    </p>
                  </div>
                  {renderKeys()}
                </div>
              )}
            </div>
          </div>

          <div className="dlg-actions">
            <button className="dlg-btn primary" onClick={() => setSettingsOpen(false)}>
              <kbd>B</kbd>完成
            </button>
          </div>
        </div>
      </div>

      <div className={`dialog${dialog ? ' open' : ''}`} role="dialog" aria-modal="true">
        <div className="dialog-card">
          <div className="dlg-tag">
            <i />
            注意
          </div>
          <h2>注意！</h2>
          <p>
            {dialog?.game ? (
              <>
                您即将启动 <b>{dialog.game.title}</b>
              </>
            ) : (
              <>
                您即将进入 <b>{dialog?.system.name}</b>
              </>
            )}
          </p>
          <p className="dlg-note">
            {dialog?.mode === 'system'
              ? `系统模式：${dialog.system.systemMode ?? '系统菜单'} · 需要对应的固件 / 系统文件`
              : `${dialog?.system.name ?? ''} · ${engineLabel(dialog?.system.engine)} · 结束后自动返回 Nest`}
          </p>
          <div className="dlg-actions">
            <button className="dlg-btn" onClick={() => setDialog(null)}>
              <kbd>B</kbd>取消
            </button>
            <button className="dlg-btn primary" onClick={() => void confirmDialog()}>
              <kbd>A</kbd>
              {dialog?.mode === 'system' ? '确认开机' : '确认启动'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
