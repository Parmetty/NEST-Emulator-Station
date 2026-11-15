import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import net from 'node:net';
import { connectDebugger } from '../src/main/websocket';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function readFrame(buffer: Buffer): { opcode: number; payload: Buffer; rest: Buffer } | null {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  }
  const maskBytes = masked ? 4 : 0;
  if (buffer.length < offset + maskBytes + length) return null;
  let payload = buffer.subarray(offset + maskBytes, offset + maskBytes + length);
  if (masked) {
    const mask = buffer.subarray(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
  }
  return { opcode, payload, rest: buffer.subarray(offset + maskBytes + length) };
}

function textFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  return Buffer.concat([header, payload]);
}

describe('ppsspp debugger websocket client', () => {
  it('performs the handshake and exchanges a JSON event', async () => {
    const received: any[] = [];
    const server = net.createServer((socket) => {
      let buffer: Buffer = Buffer.alloc(0);
      let upgraded = false;
      let key = '';
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!upgraded) {
          const end = buffer.indexOf('\r\n\r\n');
          if (end < 0) return;
          const head = buffer.subarray(0, end).toString('latin1');
          key = /sec-websocket-key:\s*(\S+)/i.exec(head)?.[1] ?? '';
          buffer = buffer.subarray(end + 4);
          const accept = createHash('sha1').update(key + GUID).digest('base64');
          socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
              'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
              `Sec-WebSocket-Accept: ${accept}\r\n` +
              'Sec-WebSocket-Protocol: debugger.ppsspp.org\r\n\r\n',
          );
          upgraded = true;
        }
        for (;;) {
          const frame = readFrame(buffer);
          if (!frame) return;
          buffer = frame.rest;
          if (frame.opcode !== 0x1) continue;
          const json = JSON.parse(frame.payload.toString('utf8'));
          received.push(json);
          socket.write(textFrame(JSON.stringify({ event: json.event })));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const client = await connectDebugger(port);
    const reply = await client.request('game.umd.insert', { path: 'E:/roms/game.iso' });
    expect(reply.event).toBe('game.umd.insert');
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ event: 'game.umd.insert', path: 'E:/roms/game.iso' });
    client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
