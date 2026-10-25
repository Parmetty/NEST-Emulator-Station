import { describe, expect, it } from 'vitest';
import path from 'node:path';
import type { LaunchEvent } from '../src/shared/contract';
import { Supervisor } from '../src/main/supervisor';

const FAKE = path.join(__dirname, '..', 'tools', 'fake-engine.mjs');

function harness() {
  const events: LaunchEvent[] = [];
  const supervisor = new Supervisor({ emit: (event) => events.push(event) });
  const waitFor = async (predicate: (e: LaunchEvent) => boolean, timeoutMs = 8_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const hit = events.find(predicate);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timeout waiting for event; got ${JSON.stringify(events)}`);
  };
  const launch = (args: string[]) =>
    supervisor.start({
      sessionId: `s-${Math.random().toString(36).slice(2)}`,
      systemId: 'gba',
      command: process.execPath,
      args: [FAKE, ...args],
    });
  return { events, supervisor, waitFor, launch };
}

describe('supervisor', () => {
  it('reports starting -> running -> exited for a clean session', async () => {
    const { supervisor, waitFor, launch } = harness();
    launch(['--rom', 'demo.gba']);

    const running = await waitFor((e) => e.state === 'running');
    expect(running.systemId).toBe('gba');

    const exited = await waitFor((e) => e.state === 'exited');
    expect(exited.code).toBe(0);
    expect(supervisor.running).toBe(0);
  });

  it('reports crashed with the engine exit code', async () => {
    const { waitFor, launch } = harness();
    launch(['--rom', 'broken.gba', '--crash']);

    const crashed = await waitFor((e) => e.state === 'crashed');
    expect(crashed.code).toBe(3);
    expect(crashed.message ?? '').toContain('catastrophic');
  });

  it('passes system mode through to the engine', async () => {
    const { waitFor, launch } = harness();
    launch(['--rom', '', '--system']);
    const exited = await waitFor((e) => e.state === 'exited');
    expect(exited.code).toBe(0);
  });

  it('kills a hanging engine on stop()', async () => {
    const { supervisor, waitFor, launch } = harness();
    launch(['--rom', 'slow.gba', '--hang']);
    const running = await waitFor((e) => e.state === 'running');
    expect(supervisor.has(running.sessionId)).toBe(true);

    expect(supervisor.stop(running.sessionId)).toBe(true);
    const stopped = await waitFor((e) => e.state === 'crashed' || e.state === 'exited');
    expect(['crashed', 'exited']).toContain(stopped.state);
    expect(supervisor.running).toBe(0);
  });
});
