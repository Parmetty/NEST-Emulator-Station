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

/** Insert a disc image (ISO/CSO) or an extracted UMD folder into the XMB. */
export async function insertUmd(port: number, romPath: string, timeoutMs = 45_000): Promise<UmdResult> {
  try {
    await waitForPort(port, timeoutMs);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  let client;
  try {
    client = await connectDebugger(port, '127.0.0.1', 10_000);
    await client.request('game.umd.insert', { path: romPath }, 20_000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  } finally {
    client?.close();
  }
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
