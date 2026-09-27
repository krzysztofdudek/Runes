/**
 * Running a CLI as a child process that can be stopped with everything it started.
 *
 * On POSIX the child leads a process group of its own (`detached`), and stopping it kills the whole group with SIGKILL: a CLI that re-executes itself (a low-memory mode, a wrapper script) answers from a grandchild, and killing only the parent would leave that running. On Windows there are no process groups; `taskkill /PID <pid> /T /F` kills the tree by parentage. A child that runs detached is also not stopped by anything else when the server goes, so a server stops every running child before it exits.
 */
import { spawn, spawnSync } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Aborting it stops the child and its tree. */
  signal?: AbortSignal;
}

export interface RunOutcome {
  /** Exit code; 1 when the child could not start or ended by a signal. */
  code: number;
  stdout: string;
  stderr: string;
  /** The child was stopped through `signal`. */
  stopped: boolean;
  /** The signal that ended the child, when one did. */
  endedBy: string | null;
}

export interface KillOptions {
  platform?: NodeJS.Platform;
  /** The synchronous spawn used for taskkill; a test knob. */
  spawnSync?: typeof spawnSync;
}

/** Kills a process and everything it started, synchronously: its process group on POSIX, its tree through taskkill on Windows. Never throws. */
export function killTree(pid: number | undefined, options: KillOptions = {}): void {
  if (!pid) return;
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    const run = options.spawnSync ?? spawnSync;
    const r = run('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    if (r.status === 0) return;
    try { process.kill(pid); } catch { /* already gone */ }
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

/** Runs `command args` without a shell, collecting its output, until it ends or `signal` stops it with its tree. */
export function runProcess(command: string, args: readonly string[], options: RunOptions = {}): Promise<RunOutcome> {
  return new Promise((resolveRun) => {
    let stdout = '';
    let stderr = '';
    let stopped = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
    } catch (e) {
      resolveRun({ code: 1, stdout, stderr: (e as Error).message, stopped, endedBy: null });
      return;
    }
    const { signal } = options;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      killTree(child.pid);
    };
    let settled = false;
    const done = (r: Omit<RunOutcome, 'stopped'>): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', stop);
      resolveRun({ ...r, stopped });
    };
    if (signal) {
      if (signal.aborted) stop();
      else signal.addEventListener('abort', stop, { once: true });
    }
    child.stdout?.setEncoding('utf8').on('data', (d: string) => { stdout += d; });
    child.stderr?.setEncoding('utf8').on('data', (d: string) => { stderr += d; });
    child.on('error', (e) => done({ code: 1, stdout, stderr: stderr + e.message, endedBy: null }));
    child.on('close', (code, sig) => done({ code: code ?? 1, stdout, stderr, endedBy: sig }));
  });
}
