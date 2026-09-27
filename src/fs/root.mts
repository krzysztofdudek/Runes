/**
 * Finding the repository a run belongs to. A linked worktree (`git worktree add`) has a `.git` file, not a directory; its main checkout is found through the git common dir, which every worktree of a repository shares. A tool whose state lives only in the main checkout (kept out of git, so a worktree cannot see it) uses that to reach its state from any worktree.
 *
 * Windows: git prints the common dir with forward slashes and a drive letter (`C:/r/.git`), or relative to the working directory; both resolve with `path.resolve`. git is run as `git` without a shell, which finds `git.exe`.
 */
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

export interface FindRootOptions {
  /** A directory or file name the tool keeps at the root. When the nearest checkout has none and its main checkout has one, the main checkout is the root. */
  marker?: string;
}

/** The nearest directory at or above `from` holding a `.git` entry (a directory in a main checkout, a file in a linked worktree), or null outside any checkout. */
export function checkoutRoot(from: string = process.cwd()): string | null {
  for (let dir = resolve(from); ; ) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Whether `dir` is the root of a linked worktree: its `.git` is a file. */
export function isLinkedWorktree(dir: string): boolean {
  try { return statSync(join(dir, '.git')).isFile(); } catch { return false; }
}

/** The absolute git common dir of the repository holding `dir`, or null when git is missing or `dir` is not in a repository. */
export function gitCommonDir(dir: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 30_000 }).toString().trim();
    return out ? resolve(dir, out) : null;
  } catch { return null; }
}

/** The main checkout of the repository holding `dir`: the directory whose `.git` is the common dir. Null for a bare repository, a separate git dir, or outside git. */
export function mainCheckout(dir: string): string | null {
  const common = gitCommonDir(dir);
  return common && basename(common) === '.git' ? dirname(common) : null;
}

/**
 * The root a tool works in: the nearest checkout at or above `from`. With a `marker`, a linked worktree without the marker whose main checkout has it resolves to the main checkout. Outside any checkout, `from` itself.
 */
export function findRoot(from: string = process.cwd(), options: FindRootOptions = {}): string {
  const dir = checkoutRoot(from);
  if (!dir) return resolve(from);
  const { marker } = options;
  if (!marker || existsSync(join(dir, marker))) return dir;
  const main = mainCheckout(dir);
  return main && resolve(main) !== dir && existsSync(join(main, marker)) ? resolve(main) : dir;
}
