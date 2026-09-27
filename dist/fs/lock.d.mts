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
export declare const LOCK_DEFAULTS: Readonly<Required<Omit<LockOptions, 'platform'>>>;
/** Thrown when the lock is not free within `waitMs`: a live holder that does not let go, or a stale lock that could not be removed in time. Nothing ran. */
export declare class LockHeldError extends Error {
    readonly path: string;
    readonly holder: string;
    readonly stale: boolean;
    readonly code = "ELOCKED";
    constructor(path: string, holder: string, stale?: boolean);
}
/** Thrown when a stale lock cannot be removed at all (no permission on the lock, on `<lock>.break` or on the directory): waiting would not help. Nothing ran. */
export declare class LockBreakError extends Error {
    readonly path: string;
    readonly holder: string;
    readonly cause: unknown;
    readonly code = "ELOCKBREAK";
    constructor(path: string, holder: string, cause: unknown);
}
/** Thrown when the lock's directory does not exist (it was removed while the caller waited, or never existed). Nothing ran. */
export declare class LockDirectoryMissingError extends Error {
    readonly path: string;
    readonly code = "ENOENT";
    constructor(path: string);
}
/** The text a holder writes into the lock: `<pid> <host> <ISO time>` and a newline. */
export declare function lockHolderText(pid?: number, host?: string, at?: Date): string;
/** Whether a process with this pid runs on this machine. A pid owned by another user counts as running. */
export declare function pidRuns(pid: number): boolean;
/**
 * Whether a lock with this content and modification time is stale: empty and older than `emptyMs`; on this host, a holder whose pid no longer runs (or, against pid reuse, one older than `reusedPidMs`); from another host (a shared checkout) or with an unreadable holder, one older than `staleMs`.
 */
export declare function lockIsStale(text: string, mtimeMs: number, options?: LockOptions, now?: number): boolean;
/**
 * Runs `fn` while holding the lock file at `lockPath`, synchronously. Re-entrant within one process for the same path: a `fn` that calls `withLock` on the same path again runs at once, and the lock is released when the outermost call ends. The lock's directory must exist.
 */
export declare function withLock<T>(lockPath: string, fn: () => T, options?: LockOptions): T;
/**
 * Runs the async `fn` while holding the lock file at `lockPath`, waiting without blocking the event loop. Not re-entrant: an `fn` that awaits `withLockAsync` on the same path again, or calls the synchronous `withLock` on it, waits for itself until `waitMs` and then throws `LockHeldError` (`ELOCKED`). Two calls in one process on the same path take turns like two processes do.
 */
export declare function withLockAsync<T>(lockPath: string, fn: () => Promise<T> | T, options?: LockOptions): Promise<T>;
