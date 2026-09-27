/**
 * Resolve a TS/JS module specifier to a repo-relative POSIX source file, or undefined.
 *
 * `exists(repoRelPosix)` reports whether a candidate FILE exists in the resolution universe
 * (disk at check time; a fixed known-set in unit tests). `deps`, when given, answers the
 * project-configuration questions a non-relative specifier needs (tsconfig, package.json);
 * without it only relative specifiers resolve. PURE except through `exists` and `deps`.
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
 *      a. tsconfig `paths` of the nearest tsconfig.json (jsconfig.json for JS), with its
 *         `extends` chain: the exact key, else the longest-prefix `*` pattern; each
 *         substitution is probed like a relative path. Exactly one substitution naming a
 *         file → that file. Two or more naming DIFFERENT files → undefined (ambiguous).
 *         A matched pattern with no hit falls through to (c), as the compiler does.
 *      b. tsconfig `baseUrl` (only when no `paths` pattern matched): joined onto baseUrl.
 *      c. An in-repo package whose package.json `name` is the specifier's package name
 *         (a workspace package): `exports` (exact subpath, else longest `*` pattern; the
 *         first condition target that names a file), else for the root `types`/`typings`,
 *         `module`, `main` and `index.*`, for a subpath the path inside the package. Two
 *         in-repo packages with the same name → undefined.
 *      Anything else is an external package or a Node built-in → undefined.
 *   A candidate path is probed as: an explicit JS-family extension (.js/.jsx/.mjs/.cjs)
 *   first tries the TS source it compiles from (NodeNext) then itself; an explicit
 *   TS extension is used as-is; any other explicit extension (.json, .css, .svg, .vue,
 *   .wasm) is probed literally; then each source extension is appended; then, for a
 *   directory holding a package.json, its `types`/`typings`/`module`/`main` entry; then
 *   the directory index (`index.ts|tsx|js|jsx|mjs|cjs`).
 */
export declare function resolveTsPath(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, deps?: TsResolveDeps): string | undefined;
/** Project configuration the non-relative rules read. Built from disk by {@link makeTsResolveDeps}. */
export interface TsResolveDeps {
    /** The tsconfig in effect for a file (its `extends` chain applied), `'unknown'` when it
     *  cannot be read reliably (unparseable, or a relative `extends` that does not exist),
     *  or undefined when the file has none. */
    tsconfigFor(fromFile: string): TsPathConfig | 'unknown' | undefined;
    /** The nearest ancestor package of a file: its directory and parsed package.json. */
    nearestPackage(fromFile: string): TsPackage | undefined;
    /** The in-repo package whose package.json `name` is `name`; `'ambiguous'` when two share it. */
    packageNamed(name: string): TsPackage | 'ambiguous' | undefined;
    /** The package whose package.json sits directly in `dir`, if any. */
    packageAt?(dir: string): TsPackage | undefined;
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
}
/**
 * Parse JSON with comments and trailing commas (the tsconfig dialect). Returns
 * undefined for anything that is still not JSON afterwards.
 */
export declare function parseJsonc(text: string): unknown;
/**
 * Build the disk-backed {@link TsResolveDeps} for a project root. Each tsconfig,
 * package.json and directory lookup is cached for the life of the returned object,
 * which one relation pass owns. The in-repo package index is built on the first bare
 * specifier that reaches package lookup: one walk of the repository that skips
 * `node_modules` (where a workspace package's own symlink lives), dot-directories and
 * any path `isExcluded` names.
 */
export declare function makeTsResolveDeps(projectRoot: string, isExcluded?: (repoRelPosix: string) => boolean): TsResolveDeps;
