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
export const LOCK_DEFAULTS = Object.freeze({
    waitMs: 20_000,
    staleMs: 30_000,
    reusedPidMs: 10 * 60_000,
    emptyMs: 2_000,
    breakStaleMs: 5_000,
});
/** Thrown when a live holder does not let go within `waitMs`. Nothing ran. */
export class LockHeldError extends Error {
    path;
    holder;
    code = 'ELOCKED';
    constructor(path, holder) {
        super(`${path} is held by another process (${holder.trim() || 'holder unknown'}) — nothing was done; retry, or remove the file if that process is gone`);
        this.path = path;
        this.holder = holder;
        this.name = 'LockHeldError';
    }
}
/** Thrown when the lock's directory does not exist (it was removed while the caller waited, or never existed). Nothing ran. */
export class LockDirectoryMissingError extends Error {
    path;
    code = 'ENOENT';
    constructor(path) {
        super(`the directory of ${path} does not exist — nothing was done`);
        this.path = path;
        this.name = 'LockDirectoryMissingError';
    }
}
const SLEEPER = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) { Atomics.wait(SLEEPER, 0, 0, ms); }
const jitter = (base, spread) => base + Math.floor(Math.random() * spread);
const errCode = (e) => e?.code;
const settle = (o = {}) => ({ ...LOCK_DEFAULTS, platform: process.platform, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) });
/** The text a holder writes into the lock: `<pid> <host> <ISO time>` and a newline. */
export function lockHolderText(pid = process.pid, host = hostname(), at = new Date()) {
    return `${pid} ${host} ${at.toISOString()}\n`;
}
/** Whether a process with this pid runs on this machine. A pid owned by another user counts as running. */
export function pidRuns(pid) {
    if (!(Number.isInteger(pid) && pid > 0))
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        return errCode(e) !== 'ESRCH';
    }
}
/**
 * Whether a lock with this content and modification time is stale: empty and older than `emptyMs`; on this host, a holder whose pid no longer runs (or, against pid reuse, one older than `reusedPidMs`); from another host (a shared checkout) or with an unreadable holder, one older than `staleMs`.
 */
export function lockIsStale(text, mtimeMs, options = {}, now = Date.now()) {
    const o = settle(options);
    const age = now - mtimeMs;
    if (!text.trim())
        return age > o.emptyMs;
    const [pid, host] = (text.split('\n')[0] ?? '').split(' ');
    if (host === hostname() && Number(pid) > 0) {
        if (!pidRuns(Number(pid)))
            return true;
        return age > o.reusedPidMs;
    }
    return age > o.staleMs;
}
// On Windows a file in the middle of being deleted refuses to open, and an unlink can meet a handle a reader still holds; both pass in milliseconds.
function transient(code, platform) {
    return platform === 'win32' && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY');
}
function unlinkPatiently(path, platform) {
    for (let i = 0;; i += 1) {
        try {
            unlinkSync(path);
            return;
        }
        catch (e) {
            if (errCode(e) === 'ENOENT')
                return;
            if (!transient(errCode(e), platform) || i >= 20)
                throw e;
            sleepSync(jitter(5, 10));
        }
    }
}
function readIfMine(path, mine) {
    try {
        return readFileSync(path, 'utf8') === mine;
    }
    catch {
        return false;
    }
}
function tryTake(path, mine, platform) {
    let fd;
    try {
        fd = openSync(path, 'wx');
    }
    catch (e) {
        const code = errCode(e);
        if (code === 'EEXIST' || transient(code, platform))
            return 'held';
        if (code === 'ENOENT')
            throw new LockDirectoryMissingError(path);
        throw e;
    }
    try {
        writeSync(fd, mine);
    }
    finally {
        closeSync(fd);
    }
    return 'taken';
}
function breakStale(path, stale, o) {
    const brk = `${path}.break`;
    const mine = lockHolderText();
    try {
        const fd = openSync(brk, 'wx');
        try {
            writeSync(fd, mine);
        }
        finally {
            closeSync(fd);
        }
    }
    catch (e) {
        if (errCode(e) !== 'EEXIST' && !transient(errCode(e), o.platform))
            return;
        try {
            if (Date.now() - statSync(brk).mtimeMs > o.breakStaleMs)
                unlinkPatiently(brk, o.platform);
        }
        catch { /* gone */ }
        return;
    }
    try {
        let now = null;
        try {
            now = readFileSync(path, 'utf8');
        }
        catch { /* released meanwhile */ }
        if (now === stale)
            unlinkPatiently(path, o.platform);
    }
    catch { /* released meanwhile */ }
    finally {
        try {
            if (readIfMine(brk, mine))
                unlinkPatiently(brk, o.platform);
        }
        catch { /* gone */ }
    }
}
// One look at a lock this process could not take: how long to wait before the next try. Throws once the wait is over.
function nextDelay(path, o, until) {
    let text;
    let mtimeMs;
    try {
        text = readFileSync(path, 'utf8');
        mtimeMs = statSync(path).mtimeMs;
    }
    catch (e) {
        if (errCode(e) === 'ENOENT')
            return 0; // released meanwhile: try again at once
        if (Date.now() > until)
            throw new LockHeldError(path, '');
        return jitter(5, 10);
    }
    if (lockIsStale(text, mtimeMs, o)) {
        breakStale(path, text, o);
        return jitter(1, 5);
    }
    if (Date.now() > until)
        throw new LockHeldError(path, text);
    return jitter(10, 40);
}
function release(path, mine, platform) {
    // Only a lock that is still this one: a lock broken as stale may already belong to someone else, and the directory may be gone with the lock in it.
    try {
        if (readIfMine(path, mine))
            unlinkPatiently(path, platform);
    }
    catch { /* removed with its directory */ }
}
const held = new Map();
/**
 * Runs `fn` while holding the lock file at `lockPath`, synchronously. Re-entrant within one process for the same path: a `fn` that calls `withLock` on the same path again runs at once, and the lock is released when the outermost call ends. The lock's directory must exist.
 */
export function withLock(lockPath, fn, options = {}) {
    const path = resolve(lockPath);
    const depth = held.get(path) ?? 0;
    if (depth > 0) {
        held.set(path, depth + 1);
        try {
            return fn();
        }
        finally {
            held.set(path, depth);
        }
    }
    const o = settle(options);
    const mine = lockHolderText();
    const until = Date.now() + o.waitMs;
    while (tryTake(path, mine, o.platform) === 'held') {
        const wait = nextDelay(path, o, until);
        if (wait > 0)
            sleepSync(wait);
    }
    held.set(path, 1);
    try {
        return fn();
    }
    finally {
        held.delete(path);
        release(path, mine, o.platform);
    }
}
/**
 * Runs the async `fn` while holding the lock file at `lockPath`, waiting without blocking the event loop. Not re-entrant: an `fn` that awaits `withLockAsync` on the same path again waits for itself until `waitMs` and fails. Two calls in one process on the same path take turns like two processes do.
 */
export async function withLockAsync(lockPath, fn, options = {}) {
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
    try {
        return await fn();
    }
    finally {
        release(path, own, o.platform);
    }
}
let asyncSeq = 0;
