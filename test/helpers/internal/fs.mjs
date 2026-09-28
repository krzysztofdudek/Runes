// The file-system modules (the lock, atomic writes, the repository root), for tests. Internal since 1.0.0: no subpath exports them until a family tool adopts them (docs/api.md). Not part of the package's API.
export * from '../../../dist/fs/lock.mjs';
export * from '../../../dist/fs/atomic.mjs';
export * from '../../../dist/fs/root.mjs';
