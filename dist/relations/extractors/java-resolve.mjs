import path from 'node:path';
/**
 * Resolve a single-TYPE Java import FQN (`com.foo.Bar`) to a repo-relative `.java`
 * file, or undefined. NO package fall-through: a hint reaches here only for a TYPE
 * (the extractor tags package wildcards with `isPackage`, routed through
 * `resolveJavaPackageFiles` instead). A type FQN whose path is actually a package
 * DIRECTORY resolves to nothing — silence, not a phantom package edge.
 */
export function resolveJavaFqn(specifier, fromFile, deps) {
    const segments = specifier.split('.').filter((s) => s.length > 0);
    if (segments.length === 0)
        return undefined;
    return resolveType(segments, fromFile, deps);
}
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
export function resolveJavaPackageFiles(packageFqn, fromFile, deps) {
    const segments = packageFqn.split('.').filter((s) => s.length > 0);
    if (segments.length === 0)
        return [];
    const pkgDir = segments.join('/'); // com/foo
    const isExcl = deps.isExcluded ?? (() => false);
    for (const dir of ancestorDirs(path.posix.dirname(toPosix(fromFile)))) {
        const repoRelDir = joinUnder(dir, pkgDir);
        const live = deps.javaFilesIn(repoRelDir).filter((f) => !isExcl(f));
        if (live.length > 0)
            return live.sort();
    }
    return [];
}
/** TYPE FQN `com.foo.Bar` → `com/foo/Bar.java` (with the nested-type parent fallback). */
function resolveType(segments, fromFile, deps) {
    const typePath = segments.join('/') + '.java'; // com/foo/Bar.java
    // Nested-type longest-match: drop the trailing segment (`Inner`) and try the
    // enclosing type's file (`com/foo/Outer.java`). Only when there is a segment to
    // drop beyond the bare class (>= 2 segments left after dropping).
    const parentTypePath = segments.length >= 2 ? segments.slice(0, -1).join('/') + '.java' : undefined;
    const isExcl = deps.isExcluded ?? (() => false);
    for (const dir of ancestorDirs(path.posix.dirname(toPosix(fromFile)))) {
        const candidates = [joinUnder(dir, typePath)];
        if (parentTypePath !== undefined)
            candidates.push(joinUnder(dir, parentTypePath));
        for (const cand of candidates) {
            // An excluded candidate is treated as though it does not exist: skip it and
            // keep walking (the rest of this root's candidates, then further-out roots)
            // rather than let it end the search the way a genuine miss never would.
            if (deps.exists(cand) && !isExcl(cand))
                return cand;
        }
    }
    return undefined;
}
/** The importing file's directory and every ancestor directory up to the repo root,
 *  nearest-first. '' (the repo root) is the final entry. */
function ancestorDirs(dir) {
    const out = [];
    let cur = dir === '.' ? '' : dir;
    for (;;) {
        out.push(cur);
        if (cur === '')
            break;
        const parent = path.posix.dirname(cur);
        cur = parent === '.' ? '' : parent;
    }
    return out;
}
/** Join a repo-relative directory with a sub-path, normalizing. '' → the sub-path itself. */
function joinUnder(dir, sub) {
    return path.posix.normalize(dir === '' ? sub : path.posix.join(dir, sub));
}
function toPosix(p) {
    return p.replace(/\\/g, '/');
}
