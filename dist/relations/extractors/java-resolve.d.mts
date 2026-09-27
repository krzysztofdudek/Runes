/**
 * Resolve a Java import FQN to a repo-relative POSIX `.java` source file, or undefined.
 *
 * The specifier is what the extractor emits: a fully-qualified Java name. The
 * dispatch boundary (`makeResolvePathToFile`) routes the two universes:
 *   - TYPE FQN (`com.foo.Bar`, from a single-type or static import): routed through
 *     `resolveJavaFqn` — returns a single file, NO package fall-through.
 *   - PACKAGE FQN (`com.foo`, from a wildcard import, tagged `isPackage`): routed
 *     through `resolveJavaPackageFiles` — returns the candidate file LIST so the
 *     caller can apply owner-set collapse (one owner → attribute, 0/2+ → silence).
 *
 * Java compiles `package a.b.c; class Foo` to a path ending `a/b/c/Foo.java` under
 * SOME source root (commonly `src/main/java`, `src/test/java`, or a module srcDir;
 * flat layouts also exist). There is no single canonical root, so — exactly like
 * the Python module-path search — we probe the FQN as a file rooted at the importing
 * file's directory and at every ancestor directory up to (and including) the repo
 * root, nearest-first. The FIRST existing candidate wins.
 *
 * RESOLUTION MISS → undefined. This fail-to-silence is the single most important
 * false-positive guard: a `java.*` / `javax.*` / `jakarta.*` stdlib type, a
 * third-party library type, or any FQN whose file is not present resolves to
 * nothing and is never flagged. A miss here is not yet final: the resolver then looks
 * the FQN up in the JVM symbol table (resolver.ts), which reaches a sibling module's
 * source root, `src/main` from `src/test`, and Kotlin declarations — still binding only
 * a FQN exactly one repository file declares.
 *
 * `deps.isExcluded`, when supplied, makes an excluded hit act as though it does
 * not exist, for BOTH resolvers: `resolveType` skips it and keeps walking (the
 * same candidate list at the current ancestor root, then further-out roots) and
 * `resolveJavaPackageFiles` skips it and, if that empties an ancestor root's
 * directory entirely, keeps climbing to the next one rather than stopping there.
 * A half-migrated or flat layout can leave the SAME FQN's file sitting under two
 * different ancestor roots — the nearer one always wins when live, but an
 * excluded nearer copy must not end the search: the farther, still-live copy is
 * the real target once the excluded one is set aside. Absent → no hit is ever
 * skipped (today's behavior, unaffected).
 */
export interface JavaResolveDeps {
    /** Does a file exist at this repo-relative POSIX path? */
    exists(repoRelPosix: string): boolean;
    /** Repo-relative POSIX paths of `.java` files directly in this directory (no recursion). */
    javaFilesIn(repoRelDir: string): string[];
    /**
     * Optional. True when the caller excludes this repo-relative POSIX path (for example a nested
     * project or a root the caller leaves out). See the file doc comment.
     */
    isExcluded?(repoRelPosix: string): boolean;
}
/**
 * Resolve a single-TYPE Java import FQN (`com.foo.Bar`) to a repo-relative `.java`
 * file, or undefined. NO package fall-through: a hint reaches here only for a TYPE
 * (the extractor tags package wildcards with `isPackage`, routed through
 * `resolveJavaPackageFiles` instead). A type FQN whose path is actually a package
 * DIRECTORY resolves to nothing — silence, not a phantom package edge.
 */
export declare function resolveJavaFqn(specifier: string, fromFile: string, deps: JavaResolveDeps): string | undefined;
/**
 * Resolve a wildcard PACKAGE FQN (`com.foo`) to the candidate `.java` files in the
 * resolved package directory, found via the same ancestor-source-root search the type
 * resolver uses. Returns the LIVE (non-excluded) file list of the FIRST ancestor root
 * whose directory has at least one (caller computes the owner set over it: one owner →
 * attribute, zero or 2+ → silence). A root whose directory exists but whose every file
 * is excluded does NOT end the search — it is treated exactly like an empty directory,
 * so the walk keeps climbing to the next ancestor root instead of committing to a
 * directory the caller owns nothing in. Empty list = the package directory (or a
 * live file in it) was found nowhere.
 */
export declare function resolveJavaPackageFiles(packageFqn: string, fromFile: string, deps: JavaResolveDeps): string[];
