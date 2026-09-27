/**
 * A cross-process lock on one file, for tools whose commands run as separate processes against the same directory (a CLI, a long-lived MCP server, other sessions' servers).
 *
 * The lock is a file taken with the exclusive-create flag, so exactly one process holds it; the holder writes its pid, host and start time inside. A lock whose holder is gone is broken and taken over; a caller that cannot get it within `waitMs` fails loudly, naming the holder, and never runs its work without it.
 *
 * Breaking a stale lock is itself serialised, behind `<lock>.break` (exclusive create): only its holder may remove the lock, and only while the lock still holds exactly the content judged stale. A live lock is never moved or renamed, so a fresh holder that took it meanwhile keeps it. A breaker that died leaves `<lock>.break` behind; it is removed once older than `breakStaleMs` (breaking takes milliseconds).
 *
 * Windows: the pid check uses `process.kill(pid, 0)`, which works there; a lock file that is being deleted can refuse to open with EPERM, EACCES or EBUSY for a moment, which is waited out like a held lock. No POSIX-only call is used.
 */
import { openSync, writeSync, closeSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';

export interface LockOptions {
  /** How long to wait for a live holder before failing, in ms. Default 20 000. */
  waitMs?: number;
  /** A lock from another host, or one whose holder cannot be read, is stale after this long, in ms. Default 30 000. */
  staleMs?: number;
  /** A lock on this host whose pid still runs is stale after this long, against pid reuse, in ms. Default 10 minutes. */
  reusedPidMs?: number;
  /** An empty lock (its holder died between create and write) is stale after this long, in ms. Default 2 000. */
  emptyMs?: number;
  /** A breaker's own `<lock>.break` left by a breaker that died is removed after this long, in ms. Default 5 000. */
  breakStaleMs?: number;
  /** The platform whose file-system quirks apply. Default `process.platform`; a test knob. */
  platform?: NodeJS.Platform;
}

type Resolved = Required<LockOptions>;

export const LOCK_DEFAULTS: Readonly<Required<Omit<LockOptions, 'platform'>>> = Object.freeze({
  waitMs: 20_000,
  staleMs: 30_000,
  reusedPidMs: 10 * 60_000,
  emptyMs: 2_000,
  breakStaleMs: 5_000,
});

/** Thrown when the lock is not free within `waitMs`: a live holder that does not let go, or a stale lock that could not be removed in time. Nothing ran. */
export class LockHeldError extends Error {
  readonly code = 'ELOCKED';
  constructor(readonly path: string, readonly holder: string, readonly stale: boolean = false) {
    super(stale
      ? `${path} is stale (${holder.trim() || 'holder unknown'}) but could not be taken over in time — nothing was done; remove the file by hand if its holder is gone`
      : `${path} is held by another process (${holder.trim() || 'holder unknown'}) — nothing was done; retry, or remove the file if that process is gone`);
    this.name = 'LockHeldError';
  }
}

/** Thrown when a stale lock cannot be removed at all (no permission on the lock, on `<lock>.break` or on the directory): waiting would not help. Nothing ran. */
export class LockBreakError extends Error {
  readonly code = 'ELOCKBREAK';
  constructor(readonly path: string, readonly holder: string, override readonly cause: unknown) {
    super(`${path} is stale (${holder.trim() || 'holder unknown'}) but cannot be removed: ${(cause as Error)?.message ?? String(cause)} — nothing was done; fix the permissions or remove the file by hand`);
    this.name = 'LockBreakError';
  }
}

/** Thrown when the lock's directory does not exist (it was removed while the caller waited, or never existed). Nothing ran. */
export class LockDirectoryMissingError extends Error {
  readonly code = 'ENOENT';
  constructor(readonly path: string) {
    super(`the directory of ${path} does not exist — nothing was done`);
    this.name = 'LockDirectoryMissingError';
  }
}

const SLEEPER = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms: number): void { Atomics.wait(SLEEPER, 0, 0, ms); }
const jitter = (base: number, spread: number): number => base + Math.floor(Math.random() * spread);
const errCode = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | undefined)?.code;
const settle = (o: LockOptions = {}): Resolved => ({ ...LOCK_DEFAULTS, platform: process.platform, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) } as Resolved);

/** The text a holder writes into the lock: `<pid> <host> <ISO time>` and a newline. */
export function lockHolderText(pid: number = process.pid, host: string = hostname(), at: Date = new Date()): string {
  return `${pid} ${host} ${at.toISOString()}\n`;
}

/** Whether a process with this pid runs on this machine. A pid owned by another user counts as running. */
export function pidRuns(pid: number): boolean {
  if (!(Number.isInteger(pid) && pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return errCode(e) !== 'ESRCH'; }
}

/**
 * Whether a lock with this content and modification time is stale: empty and older than `emptyMs`; on this host, a holder whose pid no longer runs (or, against pid reuse, one older than `reusedPidMs`); from another host (a shared checkout) or with an unreadable holder, one older than `staleMs`.
 */
export function lockIsStale(text: string, mtimeMs: number, options: LockOptions = {}, now: number = Date.now()): boolean {
  const o = settle(options);
  const age = now - mtimeMs;
  if (!text.trim()) return age > o.emptyMs;
  const [pid, host] = (text.split('\n')[0] ?? '').split(' ');
  if (host === hostname() && Number(pid) > 0) {
    if (!pidRuns(Number(pid))) return true;
    return age > o.reusedPidMs;
  }
  return age > o.staleMs;
}

// On Windows a file in the middle of being deleted refuses to open, and an unlink can meet a handle a reader still holds; both pass in milliseconds.
function transient(code: string | undefined, platform: NodeJS.Platform): boolean {
  return platform === 'win32' && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY');
}

function unlinkPatiently(path: string, platform: NodeJS.Platform): void {
  for (let i = 0; ; i += 1) {
    try { unlinkSync(path); return; } catch (e) {
      if (errCode(e) === 'ENOENT') return;
      if (!transient(errCode(e), platform) || i >= 20) throw e;
      sleepSync(jitter(5, 10));
    }
  }
}

function readIfMine(path: string, mine: string): boolean {
  try { return readFileSync(path, 'utf8') === mine; } catch { return false; }
}

function tryTake(path: string, mine: string, platform: NodeJS.Platform): 'taken' | 'held' {
  let fd: number;
  try { fd = openSync(path, 'wx'); } catch (e) {
    const code = errCode(e);
    if (code === 'EEXIST' || transient(code, platform)) return 'held';
    if (code === 'ENOENT') throw new LockDirectoryMissingError(path);
    throw e;
  }
  try { writeSync(fd, mine); } finally { closeSync(fd); }
  return 'taken';
}

function breakStale(path: string, stale: string, o: Resolved): void {
  const brk = `${path}.break`;
  const mine = lockHolderText();
  try {
    const fd = openSync(brk, 'wx');
    try { writeSync(fd, mine); } finally { closeSync(fd); }
  } catch (e) {
    const code = errCode(e);
    if (code === 'ENOENT') return;   // the directory went away: the next try reports it
    // A breaker that cannot even create its own file (a read-only directory, no permission) will never get further: say so now instead of spinning until the deadline.
    if (code !== 'EEXIST' && !transient(code, o.platform)) throw new LockBreakError(path, stale, e);
    try { if (Date.now() - statSync(brk).mtimeMs > o.breakStaleMs) unlinkPatiently(brk, o.platform); } catch { /* gone, or another breaker's to clear */ }
    return;
  }
  try {
    let now: string | null = null;
    try { now = readFileSync(path, 'utf8'); } catch { /* released meanwhile */ }
    if (now === stale) {
      try { unlinkPatiently(path, o.platform); } catch (e) { throw new LockBreakError(path, stale, e); }
    }
  } finally {
    try { if (readIfMine(brk, mine)) unlinkPatiently(brk, o.platform); } catch { /* gone */ }
  }
}

// One look at a lock this process could not take: how long to wait before the next try. Throws once the wait is over.
function nextDelay(path: string, o: Resolved, until: number): number {
  let text: string;
  let mtimeMs: number;
  try { text = readFileSync(path, 'utf8'); mtimeMs = statSync(path).mtimeMs; } catch (e) {
    if (errCode(e) === 'ENOENT') return 0;   // released meanwhile: try again at once
    if (Date.now() > until) throw new LockHeldError(path, '');
    return jitter(5, 10);
  }
  if (Date.now() > until) throw new LockHeldError(path, text, lockIsStale(text, mtimeMs, o));
  if (lockIsStale(text, mtimeMs, o)) { breakStale(path, text, o); return jitter(1, 5); }
  return jitter(10, 40);
}

function release(path: string, mine: string, platform: NodeJS.Platform): void {
  // Only a lock that is still this one: a lock broken as stale may already belong to someone else, and the directory may be gone with the lock in it.
  try { if (readIfMine(path, mine)) unlinkPatiently(path, platform); } catch { /* removed with its directory */ }
}

const held = new Map<string, number>();

/**
 * Runs `fn` while holding the lock file at `lockPath`, synchronously. Re-entrant within one process for the same path: a `fn` that calls `withLock` on the same path again runs at once, and the lock is released when the outermost call ends. The lock's directory must exist.
 */
export function withLock<T>(lockPath: string, fn: () => T, options: LockOptions = {}): T {
  const path = resolve(lockPath);
  const depth = held.get(path) ?? 0;
  if (depth > 0) {
    held.set(path, depth + 1);
    try { return fn(); } finally { held.set(path, depth); }
  }
  const o = settle(options);
  const mine = lockHolderText();
  const until = Date.now() + o.waitMs;
  while (tryTake(path, mine, o.platform) === 'held') {
    const wait = nextDelay(path, o, until);
    if (wait > 0) sleepSync(wait);
  }
  held.set(path, 1);
  try { return fn(); } finally {
    held.delete(path);
    release(path, mine, o.platform);
  }
}

/**
 * Runs the async `fn` while holding the lock file at `lockPath`, waiting without blocking the event loop. Not re-entrant: an `fn` that awaits `withLockAsync` on the same path again, or calls the synchronous `withLock` on it, waits for itself until `waitMs` and then throws `LockHeldError` (`ELOCKED`). Two calls in one process on the same path take turns like two processes do.
 */
export async function withLockAsync<T>(lockPath: string, fn: () => Promise<T> | T, options: LockOptions = {}): Promise<T> {
  const path = resolve(lockPath);
  const o = settle(options);
  const mine = lockHolderText(process.pid, hostname(), new Date());
  // Two holders in one process at the same millisecond would write the same text; a counter keeps each one's own.
  const own = `${mine.trimEnd()} ${(asyncSeq += 1)}\n`;
  const until = Date.now() + o.waitMs;
  while (tryTake(path, own, o.platform) === 'held') {
    const wait = nextDelay(path, o, until);
    await new Promise((r) => setTimeout(r, wait));
  }
  try { return await fn(); } finally { release(path, own, o.platform); }
}
let asyncSeq = 0;
