/**
 * Whole-file writes: the content goes to a temporary file beside the target and is renamed over it, so a reader that takes no lock sees the old file or the new one, never half of either.
 *
 * Windows: a rename over a file another process holds open (an editor, an indexer, a virus scanner, a reader mid-read) fails with EPERM, EACCES or EBUSY for a moment. The rename is retried with a short backoff within a time budget before the error is let through. On other platforms only EBUSY is retried; an EACCES there is a real permission problem.
 */
import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

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

const SLEEPER = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms: number): void { Atomics.wait(SLEEPER, 0, 0, ms); }

/** The error codes a rename is retried on, per platform. */
export function transientRenameCodes(platform: NodeJS.Platform = process.platform): ReadonlySet<string> {
  return new Set(platform === 'win32' ? ['EPERM', 'EACCES', 'EBUSY'] : ['EBUSY']);
}

/** Renames `from` to `to`, replacing `to` when it exists, retrying a transient failure (see the module note) within `budgetMs`. */
export function renameWithRetry(from: string, to: string, options: RenameOptions = {}): void {
  const { budgetMs = 2_000, platform = process.platform, rename = renameSync } = options;
  const retry = transientRenameCodes(platform);
  const until = Date.now() + budgetMs;
  for (let delay = 5; ; delay = Math.min(delay * 2, 100)) {
    try { rename(from, to); return; } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (!code || !retry.has(code) || Date.now() + delay > until) throw e;
      sleepSync(delay);
    }
  }
}

/** The temporary file a write uses beside `path`: hidden, unique per process and call, and ending in `.tmp` so one ignore pattern (`.*.tmp`) covers it. */
export function tempPathFor(path: string): string {
  return join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
}

/** Writes `data` to `path` whole: to a temporary file beside it, then renamed over it. The temporary file is removed when the write fails. */
export function writeAtomic(path: string, data: string | Uint8Array, options: WriteAtomicOptions = {}): void {
  const tmp = tempPathFor(path);
  try {
    writeFileSync(tmp, data, options.mode === undefined ? undefined : { mode: options.mode });
    renameWithRetry(tmp, path, options);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* never written, or already renamed */ }
    throw e;
  }
}
