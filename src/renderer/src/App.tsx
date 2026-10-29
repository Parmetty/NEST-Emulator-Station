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
import { engineLabel, systemById } from '@shared/systems';

type Row =
  | { kind: 'family'; family: FamilyView }
  | { kind: 'system'; family: FamilyView; system: SystemView };

type Selection = { type: 'family' | 'system'; id: string };

const SHELF_COLUMNS = 5;

/** Consoles with editable keyboard bindings, in the order the chips are shown. */
const KEY_SYSTEMS = (['gba', 'fc', 'sfc', 'n64', 'nds', 'ngc', 'wii', '3ds'] as const).flatMap((id) => {
  const system = systemById.get(id);
  return system ? [system] : [];
});

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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['nintendo']));
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
  const [firmware, setFirmware] = useState<FirmwareState[]>([]);
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
  const empty = !selectedSystem || locked || !selectedSystem.image;

  /* ------------------------------------------------------- photo swap */
  const [imgs, setImgs] = useState<[string, string]>(['', '']);
  const [front, setFront] = useState(0);
  const photoRef = useRef('');
  const frontRef = useRef(0);

  useEffect(() => {
    const next = selectedSystem && !locked ? relpath(selectedSystem.image) : '';
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
  }, [selectedSystem, locked]);

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
        say(result.error === 'ipl-not-recognized' ? '这个 IPL 不是 Dolphin 认可的转储' : '导入失败');
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
        'missing-wii-menu': '缺少 wii-menu.wad，或 NAND 中没有已安装的 Wii System Menu',
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
              {selectedSystem.year} · {selectedSystem.kind} · {engineLabel(selectedSystem.engine)}
            </p>
            {selectedSystem.note ? <p className="note">{selectedSystem.note}</p> : null}

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
                      <kbd>X</kbd>系统模式
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
                  const menuHeight = 92;
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
            <button className="ctx-item" onClick={() => void removeGame(menu.game)}>
              <span className="ctx-label">从库中移除</span>
              <span className="ctx-hint">不删除磁盘上的文件</span>
            </button>
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

      <div className={`dialog${settingsOpen ? ' open' : ''}`} role="dialog" aria-modal="true">
        <div className="dialog-card settings-card">
          <div className="dlg-tag">
            <i />
            设置
          </div>

          <div className="settings-cols">
            <div className="settings-col">
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

              <h2>系统文件（自备）</h2>
              <p className="dlg-note">
                IPL / WAD 需要你自己从主机 dump，Nest 不打包也不下载；导入后会复制到本机数据目录。
              </p>

              {firmware.map((item) => (
                <div className="fw-row" key={item.kind}>
                  <span>
                    {item.label}
                    <small>
                      {item.status === 'ok' ? '已就绪' : item.status === 'invalid' ? '校验未通过' : '未导入'}
                      {item.detail ? ` · ${item.detail}` : ''}
                    </small>
                  </span>
                  <button className="ghost-btn" onClick={() => void importFirmware(item.kind)}>
                    选择文件…
                  </button>
                </div>
              ))}

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

            <div className="settings-col keys-col">
              <h2>键位</h2>
              <p className="dlg-note">
                改的是引擎的键盘绑定，保存后立即生效；同一引擎的多台主机共用一套键位。
              </p>

              <div className="key-engines" role="group" aria-label="选择主机">
                {KEY_SYSTEMS.map((system) => (
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
