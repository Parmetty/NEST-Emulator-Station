import { createHash, randomBytes } from 'node:crypto';
import net from 'node:net';

/**
 * Minimal RFC 6455 text WebSocket client.
 *
 * Nest uses it for PPSSPP's debugger server (Core/WebServer + /debugger), which
 * speaks JSON events over a subprotocol. Electron 33 ships Node 20, where a
 * global WebSocket is not guaranteed, so keep this dependency-free and small.
 */
export interface DebuggerClient {
  request(event: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<any>;
  close(): void;
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const mask = randomBytes(4);
  let header: Buffer;
  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

function encodePong(payload: Buffer): Buffer {
  const mask = randomBytes(4);
  const header = Buffer.from([0x8a, 0x80 | payload.length]);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

export function connectDebugger(port: number, host = '127.0.0.1', timeoutMs = 10_000): Promise<DebuggerClient> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host });
    const key = randomBytes(16).toString('base64');
    let handshake = Buffer.alloc(0);
    let upgraded = false;
    let frameBuffer = Buffer.alloc(0);
    const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    let closed = false;

    const failAll = (error: Error) => {
      for (const waiter of pending.values()) waiter.reject(error);
      pending.clear();
    };
    const timer = setTimeout(() => {
      if (!upgraded) {
        socket.destroy();
        reject(new Error('debugger-timeout'));
      }
    }, timeoutMs);

    socket.on('error', (error) => {
      clearTimeout(timer);
      if (!upgraded) reject(error);
      failAll(error);
    });
    socket.on('close', () => {
      closed = true;
      failAll(new Error('debugger-closed'));
    });

    socket.on('connect', () => {
      const request = [
        'GET /debugger HTTP/1.1',
        `Host: ${host}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Protocol: debugger.ppsspp.org',
        '\r\n',
      ].join('\r\n');
      socket.write(request);
    });

    const flushMessages = () => {
      while (frameBuffer.length >= 2) {
        const opcode = frameBuffer[0] & 0x0f;
        const masked = (frameBuffer[1] & 0x80) !== 0;
        let length = frameBuffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (frameBuffer.length < 4) return;
          length = frameBuffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (frameBuffer.length < 10) return;
          length = Number(frameBuffer.readBigUInt64BE(2));
          offset = 10;
        }
        const maskBytes = masked ? 4 : 0;
        if (frameBuffer.length < offset + maskBytes + length) return;
        let payload = frameBuffer.subarray(offset + maskBytes, offset + maskBytes + length);
        if (masked) {
          const mask = frameBuffer.subarray(offset, offset + 4);
          payload = Buffer.from(payload);
          for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
        }
        frameBuffer = frameBuffer.subarray(offset + maskBytes + length);
        if (opcode === 0x1) {
          let json: any;
          try {
            json = JSON.parse(payload.toString('utf8'));
          } catch {
            continue;
          }
          const waiter = pending.get(String(json.event));
          if (waiter) {
            pending.delete(String(json.event));
            waiter.resolve(json);
          } else if (json.event === 'error') {
            // Unsolicited protocol error: surface it to anyone waiting.
            for (const [event, entry] of pending.entries()) {
              pending.delete(event);
              entry.reject(new Error(String(json.message ?? 'debugger-error')));
            }
          }
        } else if (opcode === 0x9) {
          try {
            socket.write(encodePong(payload));
          } catch {
            /* closed */
          }
        } else if (opcode === 0x8) {
          socket.end();
          return;
        }
      }
    };

    socket.on('data', (chunk) => {
      if (!upgraded) {
        handshake = Buffer.concat([handshake, chunk]);
        const end = handshake.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = handshake.subarray(0, end).toString('latin1');
        const rest = handshake.subarray(end + 4);
        if (!/^HTTP\/1\.1 101/i.test(head)) {
          socket.destroy();
          reject(new Error('debugger-handshake-failed'));
          return;
        }
        const accept = /sec-websocket-accept:\s*(\S+)/i.exec(head)?.[1];
        const expected = createHash('sha1').update(key + WS_GUID).digest('base64');
        if (accept && accept !== expected) {
          socket.destroy();
          reject(new Error('debugger-bad-accept'));
          return;
        }
        upgraded = true;
        clearTimeout(timer);
        if (rest.length > 0) {
          frameBuffer = Buffer.concat([frameBuffer, rest]);
          flushMessages();
        }
        resolve({
          request(event, params, waitMs = 10_000) {
            if (closed) return Promise.reject(new Error('debugger-closed'));
            return new Promise((resolveRequest, rejectRequest) => {
              const wait = setTimeout(() => {
                pending.delete(event);
                rejectRequest(new Error('debugger-request-timeout'));
              }, waitMs);
              pending.set(event, {
                resolve: (value) => {
                  clearTimeout(wait);
                  resolveRequest(value);
                },
                reject: (error) => {
                  clearTimeout(wait);
                  rejectRequest(error);
                },
              });
              try {
                socket.write(encodeTextFrame(JSON.stringify({ event, ...(params ?? {}) })));
              } catch (error) {
                clearTimeout(wait);
                pending.delete(event);
                rejectRequest(error as Error);
              }
            });
          },
          close() {
            closed = true;
            try {
              socket.end();
            } catch {
              /* already closed */
            }
          },
        });
        return;
      }
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
      flushMessages();
    });
  });
}
