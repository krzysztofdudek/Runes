/**
 * The files a resolution pass may see. Every path resolver reads the repository through one: whether a candidate exists, which entries a directory holds, the text of a configuration file. Paths are POSIX and relative to the project root the resolver was made for; `''` is the root itself.
 *
 * A consumer that resolves the contents of one commit passes {@link listedFileView} over that commit's files, so an untracked or ignored file on disk (build output, a generated config, an installed package) cannot decide where an import lands. Without a view the resolvers read the disk, as they always have.
 */
export interface FileView {
    /** Whether `path` names a file or a directory of the view. The root (`''`) always exists. */
    exists(path: string): boolean;
    /** Whether `path` names a file of the view. */
    isFile(path: string): boolean;
    /** Whether `path` names a directory of the view. The root (`''`) is one. */
    isDirectory(path: string): boolean;
    /** The entries directly inside the directory `dir`, or undefined when `dir` is not a directory of the view. */
    list(dir: string): ReadonlyArray<{
        name: string;
        kind: 'file' | 'dir';
    }> | undefined;
    /** The UTF-8 text of the file `path`, a byte order mark kept (the parsers that read configuration skip it), or undefined when the view holds no such file or it cannot be read. */
    read(path: string): string | undefined;
}
/** What the resolvers read through: a {@link FileView}, or the disk, whose listings also hold entries that are neither a file nor a directory (a symbolic link, as a directory listing reports it without following it). */
export interface FileSource {
    exists(path: string): boolean;
    isFile(path: string): boolean;
    isDirectory(path: string): boolean;
    list(dir: string): ReadonlyArray<{
        name: string;
        kind: 'file' | 'dir' | 'other';
    }> | undefined;
    read(path: string): string | undefined;
}
/**
 * A {@link FileView} of exactly the files `paths` lists, read through `read`: the files of one commit, say, with a reader over its blobs. The directories are those the paths imply, the root always among them. Anything not listed does not exist: no symbolic link unless it is listed (as the file it stands for), no installed package, no build output. Names are compared exactly, so a probe spelled in another case than the listed name finds nothing, as on a case-sensitive file system.
 *
 * Each path is POSIX and relative to the project root (`./` segments and doubled slashes are read as one spelling); a path that is absolute or climbs out of the root is ignored. `read` is called only for a listed file, with the path as listed after that normalisation, and may return undefined for a file it cannot read; an exception it throws reaches the resolver's caller. The list is taken once, when the view is made.
 */
export declare function listedFileView(paths: Iterable<string>, read: (path: string) => string | undefined): FileView;
/**
 * The disk under `projectRoot`, read the way the resolvers of 1.0.x read it, so a caller that passes no view sees exactly what it saw before views existed. That reading has two manners, and each probe keeps its own:
 *
 * - `caseExact` — a candidate probe (does this module file exist, which `.go` or `.java` files does this package directory hold): the path is resolved against the root, and every segment must be spelled the way its directory lists it, so a case-insensitive file system cannot answer `lib/Root.rs` with `lib/root.rs` (see `makeExactCaseCheck`).
 * - otherwise — a configuration read or a repository walk (a `tsconfig.json`, a `Cargo.toml`, the project manifests a walk discovers): the path is joined under the root and the file system's own case rule applies.
 *
 * Listings report entries as the directory does, without following symbolic links (`readdirSync` with file types); `exists`, `isFile` and `isDirectory` follow them, as `existsSync` and `statSync` do.
 */
export declare function diskFileView(projectRoot: string, caseExact: boolean): FileSource;
/** A repository-relative path of the entry `name` inside the directory `dir` (`''` is the root). */
export declare function joinRel(dir: string, name: string): string;
