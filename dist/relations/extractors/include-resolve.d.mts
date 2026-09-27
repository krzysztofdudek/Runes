/**
 * Resolve a C/C++ `#include` header name to a repo-relative POSIX source file, or undefined.
 * Shared by both the C (`.c`/`.h`) and C++ (`.cpp`/`.hpp`/…) dispatch branches — the
 * include mechanism is identical across the two grammars.
 *
 * The specifier is what the extractor emits: the header name as written for a quoted
 * include (`db/foo.h`), or `<name>` for an angle include (`<util/log.hpp>`).
 *
 * HEADER/IMPL SPLIT: an include always names the HEADER file, never the implementation
 * translation unit. The resolved header's OWNING NODE is the dependency target; a header
 * owned by no one maps to nothing and the dependency is SILENT (a coverage matter, never a
 * violation) — the resolver's job ends at producing the file path.
 *
 * Resolution order, mirroring the compiler ([cpp.include], GCC/Clang search order):
 *   1. QUOTED only: the including file's own directory (`<dir-of-includer>/<name>`). A hit
 *      here is what the compiler takes first, so it wins outright.
 *   2. The include ROOTS, when `roots` is supplied:
 *      - with a compilation database (`compile_commands.json`), the translation unit's own
 *        `-iquote` roots (quoted includes only) and `-I` roots, read from the flags the
 *        compiler actually used; a header that is not itself a translation unit takes the
 *        roots of every unit in the database. `-isystem` roots are never used.
 *      - without a database, a conservative PROBE of the repository root and every
 *        directory named `include`, for QUOTED includes whose name has at least two
 *        segments and no `.`/`..` segment. A bare `"config.h"` is never probed (it is the
 *        likeliest name of a generated or foreign header) and an angle include is never
 *        probed (without the real `-I` list an in-repo header and a system one look alike).
 *      Across the roots the EXACTLY-ONE-HIT rule applies: one distinct existing file →
 *      resolved; 0 or 2+ → silence. The compiler would take the first root in flag order,
 *      but a header included from another header is compiled under whichever unit includes
 *      it, so a static tool does not bet on the order — the same rule PHP applies to PSR-4
 *      roots and Java/Go to split packages.
 * A MISS → undefined, i.e. SILENCE. Excluded files (`isExcluded`) are dropped from the hit
 * set before the exactly-one decision. A name that is absolute, empty, or escapes the
 * repository root is never resolved.
 *
 * Backslashes are normalised to `/` first: a header-name is not a string literal, `\` is
 * an implementation-defined separator ([lex.header]/2), and MSVC accepts both.
 *
 * `exists(repoRelPosix)` reports whether a candidate file exists in the resolution universe
 * (disk at check time; a fixed known-set in unit tests). PURE except through its arguments.
 */
export interface IncludeRoots {
    /**
     * The include roots a compilation database gives `fromFile` (repo-relative POSIX dirs,
     * '' = repository root), or undefined when there is no usable database. `quote` holds the
     * `-iquote` roots (searched for quoted includes only), `angle` the `-I` roots (searched
     * for both forms).
     */
    compileDbRoots(fromFile: string): {
        quote: readonly string[];
        angle: readonly string[];
    } | undefined;
    /** The probe roots used when there is no database: '' and every `include` directory. */
    probeRoots(): readonly string[];
    /** Optional: true when the caller excludes this repo-relative POSIX path. */
    isExcluded?(repoRelPosix: string): boolean;
}
export declare function resolveIncludePath(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, roots?: IncludeRoots): string | undefined;
/**
 * Parse a `compile_commands.json` (the JSON Compilation Database) into per-translation-unit
 * include roots. `dbDirAbs` is the absolute directory holding the database, `projectRoot` the
 * absolute repository root. Each entry's `directory` (absolute, or — leniently — relative to
 * the database's directory) anchors its `file` and its include flags. Recognised flags:
 * `-I<dir>`, `-I <dir>`, `--include-directory=<dir>`, `-iquote<dir>`, `-iquote <dir>`, and
 * for a `cl`/`clang-cl` driver `/I<dir>`, `/I <dir>`. `-isystem` and `-idirafter` are
 * deliberately ignored (system roots). Roots and files outside the repository are dropped.
 *
 * Returns undefined when the text is not a database or no entry names a file inside the
 * repository — the caller then behaves as though there were no database.
 */
export declare function parseCompileCommands(text: string, dbDirAbs: string, projectRoot: string): CompileDb | undefined;
/** A parsed compilation database: the include roots of a file (its own entry's, or the
 *  union of every entry's when the file is not a translation unit of the database). */
export interface CompileDb {
    rootsFor(fromFile: string): {
        quote: readonly string[];
        angle: readonly string[];
    };
}
