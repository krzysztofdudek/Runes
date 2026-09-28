/**
 * @chrisdudek/runes/fs
 *
 * File-system primitives: a cross-process lock on one file, whole-file atomic writes with a Windows-safe rename, and finding the repository root through the git common dir. This index is the stable 1.x surface (docs/api.md); how a lock is judged stale is internal, and its limits are options.
 */
export { RUNES_VERSION as version } from '../version.mjs';

export { withLock, withLockAsync, LockHeldError, LockBreakError, LockDirectoryMissingError, type LockOptions } from './lock.mjs';
export { writeAtomic, renameWithRetry, type WriteAtomicOptions, type RenameOptions } from './atomic.mjs';
export { findRoot, checkoutRoot, mainCheckout, gitCommonDir, isLinkedWorktree, type FindRootOptions } from './root.mjs';
