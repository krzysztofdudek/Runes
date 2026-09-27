import path from 'node:path';
export function resolveGoImport(importPath, fromFile, deps) {
    const resolved = pickModule(importPath, fromFile, deps);
    if (resolved === undefined)
        return undefined;
    const { modulePath, moduleDir } = resolved;
    if (modulePath === '')
        return undefined;
    // The import path must be the module path itself (module root package) or a
    // descendant of it (`<modulePath>/<dir>`). Anything else is stdlib/external → silence.
    // `remainder` is the package directory RELATIVE TO THE MODULE, not the repo root.
    let remainder;
    if (importPath === modulePath) {
        remainder = ''; // module root package
    }
    else if (importPath.startsWith(modulePath + '/')) {
        remainder = importPath.slice(modulePath.length + 1);
    }
    else {
        return undefined;
    }
    // Root the module-relative remainder under the go.mod DIRECTORY. For a root
    // module (`moduleDir === ''`) this is the remainder unchanged — identical to the
    // single-module behavior. For a NESTED submodule the package lives under the
    // submodule dir (e.g. `security/advancedtls` + `internal/testutils`), NOT at the
    // repo root. Joining here is what keeps a nested-submodule internal package from
    // colliding with a same-leaf directory at the repo root.
    const rel = remainder === ''
        ? moduleDir
        : moduleDir === ''
            ? remainder
            : path.posix.join(moduleDir, remainder);
    // Normalize to a repo-relative POSIX directory (defensive against stray slashes).
    const repoRelDir = path.posix.normalize(rel === '' ? '.' : rel);
    const cleanDir = repoRelDir === '.' ? '' : repoRelDir;
    if (!deps.dirExists(cleanDir))
        return undefined;
    if (claimedByOtherModule(importPath, moduleDir, cleanDir, deps))
        return undefined;
    // Representative `.go` file in the package directory. Test files (`*_test.go`)
    // are excluded so the representative is a production source file; a directory
    // with ONLY test files falls back to one of those rather than missing a real
    // package.
    const goFiles = deps.goFilesIn(cleanDir);
    if (goFiles.length === 0)
        return undefined;
    const production = goFiles.filter((f) => !f.endsWith('_test.go'));
    const candidates = (production.length > 0 ? production : goFiles).sort();
    // Owner-set guard (package granularity), decided over the NON-EXCLUDED
    // candidates only. Drop any excluded file from the candidate list FIRST,
    // then ask whether what remains has one owner or several — a single
    // representative file cannot stand in for a package whose surviving files
    // belong to DIFFERENT owners (a parent and child carving one
    // directory, or two siblings) without fabricating or hiding a cross-owner
    // edge. Exactly one distinct owner among what remains → return a
    // (non-excluded, by construction) file that owner maps; 2+ distinct owners
    // among what remains → still split → silence (undefined). Files no owner
    // maps do not contribute an owner (a wholly-unmapped package falls through
    // to the unowned-target silence downstream, unchanged).
    //
    // No `sole` owner is found in TWO distinct situations this loop cannot
    // itself tell apart: every candidate was excluded (`remaining` is empty),
    // or `remaining` is non-empty but none of its files is owned (a
    // package no unit owns has no owner for ANY file). Either way the representative pick below must
    // still prefer a NON-EXCLUDED candidate when one exists — `remaining[0]`,
    // not the raw `candidates[0]` — because a caller that is not the owner
    // index (a lookup by another grouping) still needs a live file to find the
    // package's matched type. Only when `remaining` is itself empty does the
    // pick fall back to `candidates[0]`, an excluded file, which is exactly the
    // "every file excluded" case both consumers correctly silence.
    if (deps.ownerOf) {
        const ownerOf = deps.ownerOf;
        const isExcluded = deps.isExcluded ?? (() => false);
        const remaining = candidates.filter((f) => !isExcluded(f));
        let sole; // the single distinct owner seen so far
        for (const f of remaining) {
            const o = ownerOf(f);
            if (o === undefined)
                continue; // unmapped file → no owner contribution
            if (sole === undefined) {
                sole = o;
            }
            else if (o !== sole) {
                return undefined; // 2+ distinct owners among what remains → split package → silence
            }
        }
        if (sole !== undefined) {
            const soleOwned = remaining.filter((f) => ownerOf(f) === sole);
            if (soleOwned.length > 0)
                return soleOwned[0];
        }
        return remaining[0] ?? candidates[0];
    }
    return candidates[0];
}
/** The module an import binds through: without `modulesFor`, the nearest module; with it,
 *  the candidate whose module path is the LONGEST prefix of the import path (undefined when
 *  none matches, or when two candidates in different directories claim that same path). */
function pickModule(importPath, fromFile, deps) {
    if (deps.modulesFor === undefined)
        return deps.modulePathFor(fromFile);
    let best;
    let contradictory = false;
    for (const m of deps.modulesFor(fromFile)) {
        if (importPath !== m.modulePath && !importPath.startsWith(m.modulePath + '/'))
            continue;
        if (best === undefined || m.modulePath.length > best.modulePath.length) {
            best = m;
            contradictory = false;
        }
        else if (m.modulePath === best.modulePath && m.moduleDir !== best.moduleDir) {
            contradictory = true;
        }
    }
    return contradictory ? undefined : best;
}
/** True when a go.mod strictly below `moduleDir` and at or above `packageDir` makes the
 *  package part of ANOTHER module whose own path does not name this same directory for
 *  `importPath`. Without `moduleAt`, nothing is known and nothing is claimed. */
function claimedByOtherModule(importPath, moduleDir, packageDir, deps) {
    if (deps.moduleAt === undefined || packageDir === moduleDir)
        return false;
    const rel = moduleDir === '' ? packageDir : packageDir.slice(moduleDir.length + 1);
    const segs = rel.split('/');
    let dir = moduleDir;
    for (let i = 0; i < segs.length; i++) {
        dir = dir === '' ? segs[i] : `${dir}/${segs[i]}`;
        const nested = deps.moduleAt(dir);
        if (nested === undefined)
            continue;
        const rest = segs.slice(i + 1).join('/');
        const expected = rest === '' ? nested : `${nested}/${rest}`;
        if (expected !== importPath)
            return true;
    }
    return false;
}
