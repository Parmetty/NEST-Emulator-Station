import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FamilyView,
  GameRecord,
  HomePayload,
  LaunchEvent,
  LaunchMode,
  SystemView,
} from '@shared/contract';

type Row =
  | { kind: 'family'; family: FamilyView }
  | { kind: 'system'; family: FamilyView; system: SystemView };

type Selection = { type: 'family' | 'system'; id: string };

const SHELF_COLUMNS = 5;

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

  useEffect(() => {
    const off = window.nest.onLaunchEvent((event: LaunchEvent) => {
      if (event.state === 'exited') {
        setToast('已退出，返回 Nest');
        void refreshHome();
      }
      if (event.state === 'crashed') {
        setToast(`引擎异常退出${event.code ? `（${event.code}）` : ''}`);
        void refreshHome();
      }
    });
    return off;
  }, [refreshHome]);

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
    window.setTimeout(() => setToast((current) => (current === text ? null : current)), 1800);
  }, []);

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
        say(`${system.engine} 尚未接入`);
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
        say(`${system.engine} 尚未接入`);
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
        ? `正在启动 · ${system.engine}`
        : mode === 'system'
          ? `正在开机 · ${system.systemMode ?? '系统模式'}`
          : `正在启动 · ${system.engine}`,
    });
    const result = await window.nest.launch(system.id, mode, game?.path);
    if (!result.ok) {
      setOverlay(null);
      const map: Record<string, string> = {
        'engine-not-installed': `未找到 ${system.engine}，请先安装或指定路径`,
        'engine-manifest-missing': `缺少 ${system.engine} 的引擎清单`,
        'not-supported': '该主机尚未接入',
        'already-running': '已有一个会话在运行',
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
          <small>{sel.type === 'family' ? '预留平台 · 适配器就位后启用' : `预留入口 · ${selectedSystem?.engine ?? ''}`}</small>
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
                }`}
                onPointerEnter={() => select('system', row.system.id)}
                onClick={() => select('system', row.system.id)}
                onDoubleClick={() => void openShelf(row.system)}
              >
                <span className="label">{row.system.name}</span>
                <span className="short">
                  {favorites.has(row.system.id) ? '★ ' : ''}
                  {row.system.short}
                </span>
              </button>
            ),
          )}
        </nav>
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
            <p className="sub">
              {selectedSystem.year} · {selectedSystem.kind} · {selectedSystem.engine}
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
                    <b>{selectedSystem.lastPlayed ?? '—'}</b>
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
                {shelf.loading ? '读取中…' : `${shelf.games.length} 个游戏`} · {shelf.system.engine}
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
                className={`card${index === shelfIndex ? ' on' : ''}`}
                onPointerEnter={() => setShelfIndex(index)}
                onClick={() => askEnter(shelf.system, 'game', game)}
              >
                <span className="card-art">
                  <i>{(game.title[0] ?? '?').toUpperCase()}</i>
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
              : `${dialog?.system.name ?? ''} · ${dialog?.system.engine ?? ''} · 结束后自动返回 Nest`}
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
