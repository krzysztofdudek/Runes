import { type FileSource } from '../file-view.mjs';
/**
 * Resolve a TS/JS module specifier to a repo-relative POSIX source file, or undefined.
 *
 * `existsAny(repoRelPosix)` reports whether a candidate FILE exists in the resolution universe (disk at check time; a fixed known-set in unit tests). `deps`, when given, answers the project-configuration questions a non-relative specifier needs (tsconfig, package.json); without it only relative specifiers resolve. A file `deps.isExcluded` names acts as though it does not exist, both as a candidate and as a configuration file, so ignored build output or a generated config on disk cannot change the answer. PURE except through `existsAny` and `deps`.
 *
 * Zero false positives outrank recall: every branch below either names the file the
 * TypeScript compiler (or the bundler convention it documents) would pick, or returns
 * undefined. Resolution rules, in order:
 *
 *   0. A `?query` suffix (`./icon.svg?raw`, `./w.js?worker`) is a bundler loader hint,
 *      not part of the path — it is stripped.
 *   1. Relative ('./', '../') → joined onto the importing file's directory.
 *   2. Root-absolute ('/src/x') → the bundler convention (Vite, Next.js public imports):
 *      joined onto the importing file's PACKAGE root (the nearest ancestor holding a
 *      package.json). No package root → undefined. Never joined onto the importer's own
 *      directory, which names a file the import does not mean.
 *   3. Package-internal ('#x') → the nearest package.json `imports` map (exact key, then
 *      the longest `*` pattern); a relative target resolves inside that package, a bare
 *      target resolves as step 4 would.
 *   4. Bare ('@/x', 'src/x', '@acme/b', '@acme/b/sub'):
 *      a. tsconfig `paths` of the nearest tsconfig.json (jsconfig.json for JS and for a Vue or Svelte component), with its `extends` chain; when that config is solution-style (`references`, and its own `files`/`include`/`exclude` do not hold the file), the referenced config that holds it, and silence when several hold it and disagree. The exact key, else the longest-prefix `*` pattern; each substitution is probed like a relative path. Exactly one substitution naming a file → that file. Two or more naming DIFFERENT files → undefined (ambiguous). A matched pattern with no hit falls through to (c), as the compiler does.
 *      b. tsconfig `baseUrl` (only when no `paths` pattern matched): joined onto baseUrl.
 *      c. An in-repo package bound to the specifier's package name: the importer's own package when its nearest package.json has that `name` and `exports` (self-reference); else the one the importer's own package.json (the nearest that names a package, declares dependencies or declares a workspace; a `{"type": ...}` marker is passed over) declares under that name with a local spec (`file:`, `link:`, `portal:` or a `workspace:` path, joined onto that package's directory; a `workspace:<name>@<range>` alias names a member); else, inside a declared workspace (the nearest ancestor whose pnpm-workspace.yaml lists `packages`, or whose package.json has `workspaces`), the workspace member with that `name` (the root and the directories its globs match; a fixture outside them is never linked under its name), and while the declaring directory is itself a member of an enclosing workspace, that one's members too; with no workspace declared above the importer, any in-repo package.json with that `name`. Then `exports` (exact subpath, else longest `*` pattern; the first condition target that names a file), else for the root `types`/`typings`, `module`, `main` and `index.*`, for a subpath the path inside the package. Two candidates with the same name → undefined.
 *      Anything else is an external package or a Node built-in → undefined.
 *   A candidate path is probed as: an explicit JS-family extension (.js/.jsx/.mjs/.cjs)
 *   first tries the TS source it compiles from (NodeNext) then itself; an explicit
 *   TS extension is used as-is; any other explicit extension (.json, .css, .svg, .vue,
 *   .wasm) is probed literally; then each source extension is appended; then, for a
 *   directory holding a package.json, its `types`/`typings`/`module`/`main` entry; then
 *   the directory index (`index.ts|tsx|js|jsx|mjs|cjs`).
 */
export declare function resolveTsPath(specifier: string, fromFile: string, existsAny: (repoRelPosix: string) => boolean, deps?: TsResolveDeps): string | undefined;
/** Project configuration the non-relative rules read. Built from disk by {@link makeTsResolveDeps}. */
export interface TsResolveDeps {
    /** The tsconfig in effect for a file (its `extends` chain applied; for a solution-style config, the referenced config that holds the file), `'unknown'` when it cannot be read reliably (unparseable, a relative `extends` that does not exist, referenced configs that hold the file and disagree, or a referenced config that may hold the file and cannot be read), or undefined when the file has none. */
    tsconfigFor(fromFile: string): TsPathConfig | 'unknown' | undefined;
    /** The nearest ancestor package of a file: its directory and parsed package.json. */
    nearestPackage(fromFile: string): TsPackage | undefined;
    /** The in-repo package a bare package `name` imported from `fromFile` binds to (rule 4c); `'ambiguous'` when two candidates share the name. */
    packageNamed(name: string, fromFile: string): TsPackage | 'ambiguous' | undefined;
    /** The package whose package.json sits directly in `dir`, if any. */
    packageAt?(dir: string): TsPackage | undefined;
    /** Whether a repo-rel POSIX file is excluded: an excluded file is never a resolution target, whether or not it is on disk. */
    isExcluded?(repoRelPosix: string): boolean;
}
export interface TsPathConfig {
    /** Repo-rel POSIX directory `baseUrl` resolves to ('' = repo root), when set anywhere in the chain. */
    baseUrl?: string;
    /** `paths`, when set anywhere in the chain, with the directory its substitutions resolve from. */
    paths?: {
        base: string;
        map: Record<string, string[]>;
    };
}
export interface TsPackage {
    /** Repo-rel POSIX package directory ('' = repo root). */
    dir: string;
    manifest: PackageManifest;
}
export interface PackageManifest {
    name?: unknown;
    exports?: unknown;
    imports?: unknown;
    main?: unknown;
    module?: unknown;
    types?: unknown;
    typings?: unknown;
    workspaces?: unknown;
    dependencies?: unknown;
    devDependencies?: unknown;
    optionalDependencies?: unknown;
    peerDependencies?: unknown;
}
/**
 * Parse JSON with comments and trailing commas (the tsconfig dialect). A leading UTF-8 byte order mark (Visual Studio saves one) is skipped, as tsc, Node and npm skip it. Returns undefined for anything that is still not JSON afterwards.
 */
export declare function parseJsonc(text: string): unknown;
/**
 * Build the {@link TsResolveDeps} for the files of one source: `source` when given (a caller's view), else the disk under the project root. Each tsconfig, package.json and directory lookup is cached for the life of the returned object, which one relation pass owns. The in-repo package index is built on the first bare specifier that reaches package lookup: one walk of the repository that skips `node_modules` (where a workspace package's own symlink lives), dot-directories and any path `isExcluded` names. An excluded tsconfig, jsconfig or package.json is never read: it acts as though it does not exist.
 */
export declare function makeTsResolveDeps(projectRoot: string, isExcluded?: (repoRelPosix: string) => boolean, source?: FileSource): TsResolveDeps;
