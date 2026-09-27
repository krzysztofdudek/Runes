export interface RenameOptions {
    /** How long to keep retrying a transient failure, in ms. Default 2 000. */
    budgetMs?: number;
    /** The platform whose quirks apply. Default `process.platform`; a test knob. */
    platform?: NodeJS.Platform;
    /** The rename to call. Default `fs.renameSync`; a test knob. */
    rename?: (from: string, to: string) => void;
}
export interface WriteAtomicOptions extends RenameOptions {
    /** File mode for a newly created file. */
    mode?: number;
}
/** The error codes a rename is retried on, per platform. */
export declare function transientRenameCodes(platform?: NodeJS.Platform): ReadonlySet<string>;
/** Renames `from` to `to`, replacing `to` when it exists, retrying a transient failure (see the module note) within `budgetMs`. */
export declare function renameWithRetry(from: string, to: string, options?: RenameOptions): void;
/** The temporary file a write uses beside `path`: hidden, unique per process and call, and ending in `.tmp` so one ignore pattern (`.*.tmp`) covers it. */
export declare function tempPathFor(path: string): string;
/** Writes `data` to `path` whole: to a temporary file beside it, then renamed over it. The temporary file is removed when the write fails. */
export declare function writeAtomic(path: string, data: string | Uint8Array, options?: WriteAtomicOptions): void;
