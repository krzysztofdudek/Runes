/**
 * Resolve a PHP class FQN to a repo-relative POSIX `.php` source file, or undefined.
 *
 * The specifier is what the extractor emits: a PHP fully-qualified class name with `\`
 * separators and no leading backslash (`App\Payment\Gateway`).
 *
 * PHP maps a class FQN to a file through composer's PSR-4 autoloading. `composer.json`
 * declares `autoload.psr-4` (and `autoload-dev.psr-4`) — a map of namespace PREFIX to a
 * base DIRECTORY, e.g. `{ "App\\": "src/", "App\\Tests\\": "tests/" }`. For an FQN:
 *   - find the LONGEST psr-4 prefix that the FQN starts with (a prefix is a namespace
 *     boundary, ending in `\`);
 *   - the remainder after the prefix maps to `<baseDir>/<remainder-with-\→/>.php`;
 *   - check that file exists.
 * A PSR-4 prefix value may be an ARRAY of directories (one prefix → several roots) —
 * each candidate directory is tried. When the class file exists under EXACTLY ONE of
 * them the resolution is unambiguous and that file is returned; when it exists under
 * 2+ of them the FQN genuinely maps to two distinct files (two candidate owners)
 * and resolution is AMBIGUOUS → undefined (silence). PSR-4 forbids the same class in
 * two roots at runtime (the first autoloader hit wins arbitrarily), so a static tool
 * MUST NOT pick one — guessing a root would be a false positive. This mirrors the
 * Java/Go multi-target rule (2+ distinct targets → silence, never first-wins).
 *
 * `deps.isExcluded`, when supplied, drops an excluded hit from that ambiguity count
 * BEFORE the exactly-one check runs: an excluded file is told by the caller to not exist, so
 * it can never be the genuine target, and it must not keep a real, surviving hit
 * silenced merely because the class also used to live under a root the caller no
 * longer considers. Absent → no hit is ever dropped (today's behavior, unaffected).
 *
 * Longest-prefix matters because prefixes nest: with `App\` → `src/` and `App\Tests\` →
 * `tests/`, the FQN `App\Tests\UnitTest` must map under `tests/`, not `src/Tests/`.
 *
 * WHICH MAPS: the nearest ancestor composer.json first. When it resolves nothing (no
 * prefix matches, or the file is absent), the union of EVERY composer.json in the
 * repository is tried with the same exactly-one-hit rule — Composer registers the root
 * package and every path-repository package in one autoloader, so in a monorepo the
 * nearest map must not shadow the others. After the named PSR-4 prefixes come the
 * fallbacks: the PSR-4 empty prefix `""` (a fallback directory for every namespace, which
 * Composer documents) and PSR-0 (the whole FQN under the base directory, `_` in the class
 * name → `/`).
 *
 * FILE PATHS: a specifier containing `/` is not an FQN but a statically file-relative
 * `require`/`include` path emitted by the extractor; it is joined to the includer's
 * directory and resolves when that file exists.
 *
 * RESOLUTION MISS → undefined. This fail-to-silence is the false-positive guard: a
 * vendor / third-party class (its namespace is not in the project's psr-4 map), a
 * project that uses classmap / files autoload instead of psr-4 (no matching prefix), a
 * missing or unreadable composer.json, an FQN whose file is simply not present, or an
 * FQN whose file is present under 2+ roots of one prefix all resolve to nothing and are
 * never flagged. We never GUESS a root.
 */
export interface PhpResolveDeps {
    /**
     * The PSR-4 map in effect for `fromFile`: namespace prefix (ending in `\`) → one or
     * more base directories (repo-relative POSIX, no trailing slash; '' = repo root).
     * Read from the nearest ancestor composer.json. Empty map when none is found /
     * readable. Implementations SHOULD cache this — it is stable per composer.json root.
     */
    psr4For(fromFile: string): ReadonlyMap<string, readonly string[]>;
    /** Does a file exist at this repo-relative POSIX path? */
    exists(repoRelPosix: string): boolean;
    /**
     * Optional. True when the caller excludes this repo-relative POSIX path (for example a nested
     * project or a root the caller leaves out). A PSR-4 base-directory
     * hit that names an excluded file is dropped from the candidate set BEFORE the
     * exactly-one-hit ambiguity check runs, so a class the caller no longer considers
     * cannot keep a real, surviving copy under another root silenced. Absent → no hit
     * is ever dropped (today's behavior, unaffected).
     */
    isExcluded?(repoRelPosix: string): boolean;
    /**
     * Optional. The PSR-0 map of the same nearest composer.json that `psr4For` read (prefix →
     * base directories). Absent → no PSR-0 lookup.
     */
    psr0For?(fromFile: string): ReadonlyMap<string, readonly string[]>;
    /**
     * Optional. The autoload maps of EVERY composer.json in the repository (vendor/ excluded).
     * Consulted only when the nearest map resolves nothing: at runtime Composer registers the
     * root package and every path-repository package in one autoloader, so a monorepo's
     * cross-package class lives in a map the importing package's own composer.json does not
     * hold. Absent → no union fallback.
     */
    allMaps?(): readonly ComposerAutoload[];
}
/** One composer.json's autoload maps: PSR-4 (including the `""` fallback prefix) and
 *  PSR-0, each prefix → base directories (repo-relative POSIX, '' = repo root). */
export interface ComposerAutoload {
    psr4: ReadonlyMap<string, readonly string[]>;
    psr0: ReadonlyMap<string, readonly string[]>;
}
export declare function resolvePhpFqn(specifier: string, fromFile: string, deps: PhpResolveDeps): string | undefined;
/**
 * Parse a composer.json's `autoload.psr-4` and `autoload-dev.psr-4` into the normalized
 * prefix → directories map, with directories made relative to `composerDir` (repo-rel
 * POSIX, '' = repo root). Exported for the disk-backed deps factory and for testing.
 *
 * A prefix is kept verbatim (it ends in `\` per PSR-4 convention). A directory value is
 * a single string or an array of strings; each is normalized (trailing slash dropped,
 * `.`/`''` → the composerDir itself). Malformed entries are skipped. autoload-dev keys
 * supplement the main map (a key present in both takes the union of directories).
 */
export declare function parsePsr4(composerJsonText: string, composerDir: string): Map<string, string[]>;
/** Parse both autoload kinds of a composer.json (see {@link parsePsr4}); PSR-0 uses the same
 *  prefix → directories shape (a PSR-0 prefix need not end in `\`, e.g. `Twig_`). */
export declare function parseComposerAutoload(composerJsonText: string, composerDir: string): ComposerAutoload;
