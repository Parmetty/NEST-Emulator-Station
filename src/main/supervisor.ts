import { spawn, type ChildProcess } from 'node:child_process';
import type { LaunchEvent, LaunchState } from '../shared/contract';

export interface LaunchSpec {
  sessionId: string;
  systemId: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * Only for console-style engines. On Windows this maps to STARTF_USESHOWWINDOW,
   * which also hides the *first window* of a GUI app — mGBA would run with no
   * visible window at all if we set it for native engines.
   */
  windowsHide?: boolean;
}

export interface SupervisorOptions {
  emit: (event: LaunchEvent) => void;
}

const STDERR_TAIL = 2000;

/**
 * Owns the emulator process lifecycle. Everything the UI knows about a launch
 * comes from here: starting -> running -> exited | crashed.
 */
export class Supervisor {
  private readonly children = new Map<string, ChildProcess>();

  constructor(private readonly opts: SupervisorOptions) {}

  get running(): number {
    return this.children.size;
  }

  has(sessionId: string): boolean {
    return this.children.has(sessionId);
  }

  start(spec: LaunchSpec): boolean {
    if (this.children.has(spec.sessionId)) return false;
    this.emit(spec, 'starting');

    let child: ChildProcess;
    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        windowsHide: spec.windowsHide ?? false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.emit(spec, 'crashed', { message: (err as Error).message });
      return false;
    }

    this.children.set(spec.sessionId, child);
    let settled = false;
    let stderrTail = '';

    const finish = (state: LaunchState, code: number | null, message?: string) => {
      if (settled) return;
      settled = true;
      this.children.delete(spec.sessionId);
      this.emit(spec, state, { code, message });
    };

    child.once('spawn', () => {
      console.log(`[nest] spawned ${spec.systemId} pid=${child.pid ?? '?'} cmd="${spec.command}"`);
      this.emit(spec, 'running');
    });
    child.once('error', (err) => finish('crashed', null, err.message));
    child.stderr?.on('data', (buf: Buffer) => {
      stderrTail = (stderrTail + buf.toString()).slice(-STDERR_TAIL);
    });
    child.once('close', (code, signal) => {
      if (code === 0) finish('exited', 0);
      else finish('crashed', code, signal ? `terminated by ${signal}` : stderrTail.trim() || undefined);
    });

    return true;
  }

  /** Cooperative stop, then a hard tree kill on Windows so no orphan emulator survives. */
  stop(sessionId: string): boolean {
    const child = this.children.get(sessionId);
    if (!child || !child.pid) return false;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
    return true;
  }

  stopAll(): void {
    for (const id of [...this.children.keys()]) this.stop(id);
  }

  private emit(
    spec: LaunchSpec,
    state: LaunchState,
    extra: { code?: number | null; message?: string } = {},
  ): void {
    this.opts.emit({
      sessionId: spec.sessionId,
      systemId: spec.systemId,
      state,
      code: extra.code ?? null,
      message: extra.message,
      at: Date.now(),
    });
  }
}
