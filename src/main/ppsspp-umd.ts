import net from 'node:net';
import { connectDebugger } from './websocket';

/**
 * "Insert the disc" for the running PSP XMB.
 *
 * PPSSPP's WebSocket debugger exposes `game.umd.insert` (see its
 * docs/VSHBootInvestigation.md): the disc appears in the XMB Game column and
 * launching it boots the game. Nest starts the XMB with `--debugger=<port>`
 * and sends the event once the debugger socket accepts connections.
 */
export interface UmdResult {
  ok: boolean;
  error?: string;
}

export function freeTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('no-free-port'))));
    });
  });
}

export function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.setTimeout(1500);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('timeout', () => {
        socket.destroy();
        retry();
      });
      socket.once('error', () => {
        socket.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() >= deadline) {
        reject(new Error('debugger-not-listening'));
        return;
      }
      setTimeout(attempt, 250);
    };
    attempt();
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Insert a disc image (ISO/CSO) or an extracted UMD folder into the XMB.
 *
 * The debugger port starts accepting connections before the VSH has booted;
 * inserting then fails with "Game not running" and the shell would boot with an
 * empty drive. Poll game.status until the VSH reports itself, give the drive
 * callback a moment, then insert. The same loop covers a slow first boot.
 */
export async function insertUmd(port: number, romPath: string, timeoutMs = 60_000): Promise<UmdResult> {
  try {
    await waitForPort(port, timeoutMs);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  const deadline = Date.now() + timeoutMs;
  let lastError = 'game-not-running';
  while (Date.now() < deadline) {
    let client;
    try {
      client = await connectDebugger(port, '127.0.0.1', 8000);
      const status: any = await client.request('game.status', {}, 8000);
      if (!status?.game?.id) {
        lastError = 'game-not-running';
        await sleep(500);
        continue;
      }
      // The VSH just reached its main loop; let the drive callback register.
      await sleep(1200);
      await client.request('game.umd.insert', { path: romPath }, 15_000);
      return { ok: true };
    } catch (error) {
      lastError = (error as Error).message;
      await sleep(800);
    } finally {
      client?.close();
    }
  }
  return { ok: false, error: lastError };
}

/** Take the disc back out (used when the player closes the session from Nest). */
export async function ejectUmd(port: number): Promise<UmdResult> {
  let client;
  try {
    client = await connectDebugger(port, '127.0.0.1', 5000);
    await client.request('game.umd.eject', {}, 5000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  } finally {
    client?.close();
  }
}
