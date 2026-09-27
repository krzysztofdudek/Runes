/**
 * @chrisdudek/runes/fs
 *
 * File-system primitives: a cross-process lock on one file, whole-file atomic writes with a Windows-safe rename, and finding the repository root through the git common dir.
 */
export { RUNES_VERSION as version } from '../version.mjs';

/** The subpath this module is published under. */
export const subpath = 'fs';

export { withLock, withLockAsync, lockIsStale, lockHolderText, pidRuns, LOCK_DEFAULTS, LockHeldError, LockDirectoryMissingError, type LockOptions } from './lock.mjs';
export { writeAtomic, renameWithRetry, transientRenameCodes, tempPathFor, type WriteAtomicOptions, type RenameOptions } from './atomic.mjs';
export { findRoot, checkoutRoot, mainCheckout, gitCommonDir, isLinkedWorktree, type FindRootOptions } from './root.mjs';
