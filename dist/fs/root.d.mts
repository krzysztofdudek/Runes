export interface FindRootOptions {
    /** A directory or file name the tool keeps at the root. When the nearest checkout has none and its main checkout has one, the main checkout is the root. */
    marker?: string;
}
/** The nearest directory at or above `from` holding a `.git` entry (a directory in a main checkout, a file in a linked worktree), or null outside any checkout. */
export declare function checkoutRoot(from?: string): string | null;
/** Whether `dir` is the root of a linked worktree: its `.git` is a file. */
export declare function isLinkedWorktree(dir: string): boolean;
/** The absolute git common dir of the repository holding `dir`, or null when git is missing or `dir` is not in a repository. */
export declare function gitCommonDir(dir: string): string | null;
/** The main checkout of the repository holding `dir`: the directory whose `.git` is the common dir. Null for a bare repository, a separate git dir, or outside git. */
export declare function mainCheckout(dir: string): string | null;
/**
 * The root a tool works in: the nearest checkout at or above `from`. With a `marker`, a linked worktree without the marker whose main checkout has it resolves to the main checkout. Outside any checkout, `from` itself.
 */
export declare function findRoot(from?: string, options?: FindRootOptions): string;
