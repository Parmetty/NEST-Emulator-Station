import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { copyFile, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { app, BrowserWindow, shell } from 'electron';
import { CH, type LaunchEvent } from '../shared/contract';
import { systemById, type SystemId } from '../shared/systems';
import { coversDir, createServices, registerIpc, shotsDir, startLaunch, type Services } from './ipc';

const SMOKE = process.argv.includes('--smoke') || process.env.NEST_SMOKE === '1';

/** Everything the main process logs also lands in <userData>/nest.log. */
function installFileLogging(): void {
  let file = '';
  try {
    file = path.join(app.getPath('userData'), 'nest.log');
  } catch {
    return;
  }
  const wrap = (original: (...args: unknown[]) => void) => (...args: unknown[]) => {
    try {
      appendFileSync(file, `${new Date().toISOString()} ${args.map(String).join(' ')}\n`);
    } catch {
      /* logging must never break the app */
    }
    original(...args);
  };
  console.log = wrap(console.log.bind(console));
  console.error = wrap(console.error.bind(console));
}

let mainWindow: BrowserWindow | null = null;
let services: Services | null = null;

/* ---------------------------------------------------- cover screenshots */
/**
 * Covers come from the emulator itself, not from a screen grab: mGBA writes a
 * native-resolution PNG of the emulated screen (240x160 for GBA) when it gets
 * its screenshot hotkey. That is the only faithful "what the console showed"
 * without guessing about window chrome or letterboxing.
 *
 * mGBA is launched with `-C screenshotPath=<userData>/shots`, and a tiny
 * PowerShell helper presses F12 every few seconds while the game runs.
 */
const captureHelpers = new Map<string, ChildProcess>();

async function clearShots(): Promise<void> {
  const dir = shotsDir();
  try {
    const entries = await readdir(dir);
    await Promise.all(
      entries.filter((name) => name.toLowerCase().endsWith('.png')).map((name) => unlink(path.join(dir, name))),
    );
  } catch {
    /* directory may not exist yet */
  }
}

async function newestShot(): Promise<string | null> {
  const dir = shotsDir();
  try {
    const entries = await readdir(dir);
    const files = await Promise.all(
      entries
        .filter((name) => name.toLowerCase().endsWith('.png'))
        .map(async (name) => {
          const full = path.join(dir, name);
          const info = await stat(full);
          return { full, at: info.mtimeMs };
        }),
    );
    if (files.length === 0) return null;
    files.sort((a, b) => b.at - a.at);
    return files[0].full;
  } catch {
    return null;
  }
}

/**
 * Aspect comes from the engine manifest (`captureAspect`): every frontend adds
 * a different amount of chrome, so this is a property of the engine, not of the
 * console. Omitted means "the client area is already the screen" (e.g. FCEUX).
 */
function captureToolPath(): string {
  return path.join(app.getAppPath(), 'resources', 'tools', 'nest-capture.exe');
}

function startShotHelper(sessionId: string, pid: number, aspect: number): void {
  const exe = captureToolPath();
  const args = [
    '--pid',
    String(pid),
    '--out',
    shotsDir(),
    '--interval',
    '5000',
    '--max',
    '60',
    '--log',
    path.join(shotsDir(), 'capture.log'),
  ];
  if (aspect > 0) args.push('--aspect', String(aspect));

  const helper = spawn(exe, args, { windowsHide: true, stdio: 'ignore' });
  captureHelpers.set(sessionId, helper);
  helper.once('exit', () => captureHelpers.delete(sessionId));
  console.log(`[nest] capture tool started for pid=${pid} aspect=${aspect || '-'}`);
}

async function finishCoverCapture(sessionId: string, gameId?: string | null): Promise<void> {
  const helper = captureHelpers.get(sessionId);
  if (helper) {
    helper.kill();
    captureHelpers.delete(sessionId);
  }
  if (!gameId || !services) {
    await clearShots();
    return;
  }

  try {
    // The emulator writes screenshots asynchronously; give it a moment before
    // deciding that nothing was captured.
    let shot = await newestShot();
    if (!shot) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      shot = await newestShot();
    }
    if (!shot) {
      const entries = await readdir(shotsDir()).catch(() => [] as string[]);
      console.log(`[nest] no screenshot captured; shots dir has ${entries.length} entries`);
      return;
    }
    const dir = coversDir();
    await mkdir(dir, { recursive: true });
    const name = `${gameId}.png`;
    // The capture tool already cropped to the console's screen ratio.
    await copyFile(shot, path.join(dir, name));
    await services.store.updateGame(gameId, { cover: name, coverAt: Date.now() });
    console.log(`[nest] cover saved for ${gameId} from ${path.basename(shot)}`);
  } catch (err) {
    console.error('[nest] cover save failed:', (err as Error).message);
  } finally {
    await clearShots();
  }
}

function createWindow(): BrowserWindow {
  console.log('[nest] window: constructing');
  const win = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    center: true,
    show: false,
    backgroundColor: '#08080a',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#08080a', symbolColor: '#f4f4f6', height: 38 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  console.log('[nest] window: constructed');

  win.once('ready-to-show', () => {
    console.log('[nest] window: ready-to-show');
    win.show();
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[nest] renderer gone:', JSON.stringify(details));
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[nest] did-fail-load: ${code} ${desc}`);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));

  return win;
}

async function boot(): Promise<void> {
  installFileLogging();
  console.log('[nest] boot: services');
  const events: LaunchEvent[] = [];
  services = createServices((event) => {
    const e = event as LaunchEvent;
    events.push(e);

    if (e.state === 'starting' && services?.store.getSettings().minimizeOnLaunch) {
      mainWindow?.minimize();
    }
    if (e.state === 'running') {
      const system = systemById.get(e.systemId as SystemId);
      const engine = system ? services?.engines.get(system.engine) : undefined;
      const pid = services?.supervisor.pid(e.sessionId);
      if (pid) {
        const aspect = engine?.captureAspect ?? 0;
        void clearShots().then(() => startShotHelper(e.sessionId, pid, aspect));
      }
    }
    if (e.state === 'exited' || e.state === 'crashed') {
      void finishCoverCapture(e.sessionId, e.gameId);
      mainWindow?.restore();
      mainWindow?.focus();
    }
    mainWindow?.webContents.send(CH.launchEvent, event);
  });
  console.log('[nest] boot: store');
  await services.store.load();
  console.log('[nest] boot: engines');
  await services.engines.load();

  const preloadScan = process.argv.find((arg) => arg.startsWith('--scan='));
  if (preloadScan) {
    const { scanFolder } = await import('./scanner');
    const files = await scanFolder(preloadScan.slice('--scan='.length));
    const result = await services.store.upsertGames(files);
    console.log(`[nest] preload scan: +${result.added} (${result.skipped} duplicates)`);
  }
  console.log('[nest] boot: ipc');
  registerIpc(services);

  console.log('[nest] boot: window');
  mainWindow = createWindow();
  console.log('[nest] boot: window created');
  mainWindow.on('closed', () => {
    services?.supervisor.stopAll();
    mainWindow = null;
  });

  const shotFlag = process.argv.find((arg) => arg.startsWith('--shot='));
  if (shotFlag) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          await mainWindow!.webContents.executeJavaScript(
            "document.body.classList.add('still'); true",
          );
          if (process.argv.includes('--settings')) {
            await mainWindow!.webContents.executeJavaScript(
              "document.querySelector('.ghost-btn')?.click(); true",
            );
          }
          if (process.argv.includes('--menu')) {
            await mainWindow!.webContents.executeJavaScript(
              `(() => {
                 const card = document.querySelector('.card');
                 if (!card) return false;
                 const r = card.getBoundingClientRect();
                 card.dispatchEvent(new MouseEvent('contextmenu', {
                   bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 40,
                 }));
                 return true;
               })(); true`,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 350));
          const image = await mainWindow!.webContents.capturePage();
          await writeFile(shotFlag.slice('--shot='.length), image.toPNG());
          console.log('[nest] shot saved');
        } catch (err) {
          console.error('[nest] shot failed', (err as Error).message);
        }
        services?.supervisor.stopAll();
        app.exit(0);
      }, 1800);
    });
  }

  const selectFlag = process.argv.find((arg) => arg.startsWith('--select='));
  if (shotFlag && selectFlag) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          await mainWindow!.webContents.executeJavaScript(
            `window.__NEST_SELECT__ && window.__NEST_SELECT__(${JSON.stringify(selectFlag.slice('--select='.length))}); true`,
          );
        } catch {
          /* best effort */
        }
      }, 700);
    });
  }

  const shelfFlag = process.argv.find((arg) => arg.startsWith('--shelf='));
  if (shotFlag && shelfFlag) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          await mainWindow!.webContents.executeJavaScript(
            `window.__NEST_OPEN_SHELF__ && window.__NEST_OPEN_SHELF__(${JSON.stringify(shelfFlag.slice('--shelf='.length))}); true`,
          );
        } catch {
          /* best effort */
        }
      }, 800);
    });
  }

  const dumpFlag = process.argv.find((arg) => arg.startsWith('--dump='));
  if (dumpFlag) {
    mainWindow.webContents.once('did-finish-load', () => {
      const delayArg = process.argv.find((arg) => arg.startsWith('--dump-after='));
      const dumpDelay = delayArg ? Number(delayArg.split('=')[1]) || 1600 : 1600;
      if (process.argv.includes('--toast-probe')) {
        void mainWindow!.webContents.executeJavaScript("window.__NEST_SAY__ && window.__NEST_SAY__('已退出，返回 Nest'); true");
      }
      setTimeout(async () => {
        try {
          const state = await mainWindow!.webContents.executeJavaScript(
            'JSON.stringify(window.__NEST_STATE__ ?? null)',
          );
          const info = await mainWindow!.webContents.executeJavaScript(
            'document.querySelector(".toast")?.className ?? "NO_INFO_ELEMENT"',
          );
          await writeFile(dumpFlag.slice('--dump='.length), `${String(state)}\n\ntoast: ${String(info)}`);
          console.log('[nest] dump saved');
        } catch (err) {
          console.error('[nest] dump failed', (err as Error).message);
        }
        app.exit(0);
      }, dumpDelay);
    });
  }

  if (process.argv.includes('--selftest')) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const games = services!.store.games('gba');
        if (games.length === 0) {
          console.log('[nest] selftest failed: no games (pass --scan=<folder>)');
          app.exit(2);
          return;
        }
        const target = games[0];
        const result = await startLaunch(services!, { systemId: 'gba', mode: 'game', rom: target.path });
        if (!result.ok) {
          console.log(`[nest] selftest failed: launch ${result.error}`);
          app.exit(3);
          return;
        }
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline) {
          if (events.some((e) => e.state === 'exited' || e.state === 'crashed')) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const final = events.find((e) => e.state === 'exited' || e.state === 'crashed');
        const recorded = services!.store.games('gba').find((g) => g.id === target.id)?.lastPlayed ?? null;

        if (!final) {
          console.log('[nest] selftest failed: engine never exited');
          app.exit(4);
          return;
        }
        if (final.state !== 'exited' || final.code !== 0) {
          console.log(`[nest] selftest failed: engine ${final.state} code=${final.code}`);
          app.exit(5);
          return;
        }
        if (!recorded) {
          console.log('[nest] selftest failed: game was not marked as played');
          app.exit(6);
          return;
        }
        console.log(
          `[nest] selftest ok: launched "${target.title}", engine exited 0, lastPlayed recorded`,
        );
        services?.supervisor.stopAll();
        app.exit(0);
      }, 1500);
    });
  }

  const tryFlag = process.argv.find(
    (arg) => arg === '--trylaunch' || arg.startsWith('--trylaunch='),
  );
  if (tryFlag) {
    mainWindow.webContents.once('did-finish-load', () => {
      const systemId = tryFlag.includes('=') ? tryFlag.split('=')[1] : 'gba';
      setTimeout(async () => {
        const games = services!.store.games(systemId);
        if (games.length === 0) {
          console.log('[nest] trylaunch failed: no games (pass --scan=<folder>)');
          app.exit(2);
          return;
        }
        const target = games[0];
        const result = await startLaunch(services!, { systemId, mode: 'game', rom: target.path });
        if (!result.ok) {
          console.log(`[nest] trylaunch failed: ${result.error}`);
          app.exit(3);
          return;
        }
        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline && !events.some((e) => e.state === 'running')) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const running = events.some((e) => e.state === 'running');
        console.log(
          `[nest] trylaunch ${running ? 'ok' : 'failed'}: ${target.fileName} ${running ? 'started' : 'never started'}`,
        );
        if (process.argv.includes('--hold') || process.argv.some((a) => a.startsWith('--hold='))) {
          const holdArg = process.argv.find((a) => a.startsWith('--hold='));
          const ms = holdArg ? Number(holdArg.split('=')[1]) || 6000 : 6000;
          await new Promise((resolve) => setTimeout(resolve, ms));
        }
        services!.supervisor.stopAll();
        setTimeout(() => app.exit(running ? 0 : 1), 2500);
      }, 1500);
    });
  }

  if (process.argv.includes('--flow')) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const script = `(async () => {
          const out = { step: 'open' };
          const enter = [...document.querySelectorAll('.key')].find((b) => b.textContent.includes('进入'));
          if (!enter) return { ...out, error: 'no-enter-button' };
          enter.click();
          await new Promise((r) => setTimeout(r, 700));
          const card = document.querySelector('.card');
          if (!card) return { ...out, step: 'shelf', error: 'no-card' };
          card.click();
          await new Promise((r) => setTimeout(r, 400));
          const ok = [...document.querySelectorAll('.dlg-btn')].find((b) => b.textContent.includes('确认'));
          if (!ok) return { ...out, step: 'dialog', error: 'no-confirm-button' };
          ok.click();
          return { ...out, step: 'clicked' };
        })()`;
        try {
          const result = await mainWindow!.webContents.executeJavaScript(script);
          console.log('[nest] flow ui:', JSON.stringify(result));
        } catch (err) {
          console.log('[nest] flow ui error:', (err as Error).message);
        }
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline && !events.some((e) => e.state === 'running')) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const final = events.find((e) => e.state === 'running' || e.state === 'crashed');
        console.log('[nest] flow result:', JSON.stringify(final ?? null));
        services!.supervisor.stopAll();
        setTimeout(() => app.exit(final?.state === 'running' ? 0 : 1), 800);
      }, 1600);
    });
  }

  if (SMOKE) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const ready = await mainWindow?.webContents.executeJavaScript(
            'window.__NEST_READY__ === true',
          );
          console.log(`[nest] smoke ${ready ? 'ok' : 'failed'}: renderer ${ready ? 'rendered' : 'did not render'}`);
          services?.supervisor.stopAll();
          app.exit(ready ? 0 : 1);
        } catch (err) {
          console.error('[nest] smoke error', (err as Error).message);
          app.exit(1);
        }
      }, 1500);
    });
  }
}

app.whenReady().then(boot).catch((err) => {
  console.error('[nest] boot failed', err);
  app.exit(1);
});

app.on('window-all-closed', () => {
  services?.supervisor.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  services?.supervisor.stopAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
});
