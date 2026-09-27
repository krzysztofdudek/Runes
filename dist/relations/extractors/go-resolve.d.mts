/**
 * Resolve a Go import PATH to a repo-relative POSIX `.go` source file, or undefined.
 *
 * A Go import path (`example.com/mod/foo/bar`) names a package DIRECTORY, not a
 * single file. Mapping it to an owner requires:
 *   (a) the module path from `go.mod` at the module root;
 *   (b) stripping that module prefix from the import path to get the repo-relative
 *       package DIRECTORY;
 *   (c) finding a representative `.go` file in that directory on disk;
 *   (d) handing that file to the owner index downstream.
 *
 * An import path that does NOT start with the module path (a stdlib package like
 * `fmt`/`os`, or an external module) resolves to NO mapped file → undefined. This
 * fail-to-silence is the single most important false-positive guard: only imports
 * under the repo's own module are resolvable; everything else is silent.
 *
 * Dot-imports (`. "pkg"`) and blank imports (`_ "pkg"`) still name a real package
 * path, so the extractor emits the path normally and this resolver treats it like
 * any other — the local-binding form is irrelevant here.
 *
 * Resolution is pure except through `deps`, which provides disk access derived
 * from the project root. The module path is read from go.mod once and cached by
 * the caller (`makeGoResolveDeps` in resolve-path.ts).
 */
export interface GoResolveDeps {
    /**
     * The module path declared by the nearest `go.mod` for `fromFile` (the `module
     * <path>` line) together with the repo-relative POSIX DIRECTORY that go.mod sits
     * in, or undefined when no go.mod is found / readable. `moduleDir` is `''` when
     * the module is rooted at the repo root, and a non-empty repo-relative POSIX path
     * when the nearest go.mod is a NESTED SUBMODULE (e.g. `security/advancedtls`).
     *
     * Both halves are required to root a package: stripping `modulePath` from the
     * import path yields the package remainder RELATIVE TO THE MODULE, and that
     * remainder must be joined onto `moduleDir` (not the repo root) to get the real
     * on-disk package directory. Discarding `moduleDir` mis-roots every nested-submodule
     * import to the repo root — a confirmed false-positive source. Implementations
     * SHOULD cache this — it is stable for a given module root.
     */
    modulePathFor(fromFile: string): {
        modulePath: string;
        moduleDir: string;
    } | undefined;
    /**
     * Optional. Every in-repo module the importing file can reach: its own module, every
     * ANCESTOR module (a nested module importing its parent), and every `use` member of the
     * nearest `go.work`. When supplied, an import binds through the candidate with the
     * LONGEST module path that prefixes it (a package belongs to the module with the longest
     * matching path); two candidates claiming the same longest path in different directories
     * are contradictory and silence the import. Absent → only `modulePathFor`'s module.
     */
    modulesFor?(fromFile: string): Array<{
        modulePath: string;
        moduleDir: string;
    }>;
    /**
     * Optional. The module path declared by a go.mod directly in this repo-relative POSIX
     * directory, or undefined when there is none. When supplied, a package directory that a
     * DEEPER go.mod claims (a nested module between the matched module's root and the
     * package) is accepted only when that nested module's own path names the same directory;
     * otherwise the directory belongs to a different module and the import is silenced.
     */
    moduleAt?(repoRelDir: string): string | undefined;
    /** Does a directory exist at this repo-relative POSIX path? */
    dirExists(repoRelDir: string): boolean;
    /** Repo-relative POSIX paths of `.go` files directly in this directory (no recursion). */
    goFilesIn(repoRelDir: string): string[];
    /**
     * Optional. Repo-relative POSIX file → owner id, or undefined when no
     * owner claims it. When supplied, resolveGoImport becomes OWNER-SET-AWARE: it
     * computes the owner of every production `.go` file the package directory
     * has left AFTER `isExcluded` below has removed any excluded one; all-one-owner
     * among what remains attributes that owner's representative file, 2+ distinct
     * owners among what remains silences the import entirely (package granularity —
     * a split package has no single owner, so attributing it to any one
     * file's owner would fabricate or hide a cross-owner edge). Absent → today's
     * lexicographically-first pick, no owner check.
     *
     * Whether this is the raw index or one already guarded against an exclusion
     * set makes no difference here: every file this function queries it through
     * has already passed `isExcluded`, so a raw and a guarded index answer the
     * same thing for it either way.
     */
    ownerOf?(repoRelPosix: string): string | undefined;
    /**
     * Optional. True when the caller excludes this repo-relative POSIX path (a
     * nested project or a root the caller leaves out). An excluded
     * file is dropped from the package's candidate list BEFORE the owner-set
     * decision runs — the split-or-not question is answered from what remains,
     * never from the full, pre-exclusion file list. This is what keeps the
     * decision honest about every OTHER file in the package: an exclusion
     * removes its own file from consideration and nothing else. It can never
     * fabricate an owner a file never had (the owner set is still computed from
     * real mappings, just fewer files), and it can never bury a real dependency
     * reached through a file that is still there merely because some other,
     * now-excluded file used to make the package look split. When every file in
     * the package is excluded, nothing remains to decide from — the fallback
     * pick below has no non-excluded candidate left either, so it hands back
     * the (excluded) file anyway, and the caller's own, separately guarded
     * owner/type lookup answers "no owner" for it, the same silence a
     * wholly-unmapped package already gets. Absent → no file is ever dropped
     * (today's behavior, unaffected).
     */
    isExcluded?(repoRelPosix: string): boolean;
}
export declare function resolveGoImport(importPath: string, fromFile: string, deps: GoResolveDeps): string | undefined;
