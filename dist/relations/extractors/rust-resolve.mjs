import path from 'node:path';
export function resolveRustPath(specifier, fromFile, exists, deps) {
    const segments = specifier.split('::').filter((s) => s.length > 0);
    if (segments.length === 0)
        return undefined;
    const root = segments[0];
    const rest = segments.slice(1);
    const declares = declaresOf(deps);
    if (root === 'super' || root === 'self') {
        return resolveRelative(root, segments, fromFile, exists, deps);
    }
    const crate = deps.crateRootFor(fromFile);
    if (crate === undefined)
        return undefined; // no Cargo.toml ancestor → not a crate path
    if (root === 'crate') {
        return resolveFromModuleDir(crate.srcDir, rest, exists, rootContext(crate.srcDir, crate.rootFiles, declares));
    }
    // A bare leading identifier: the current crate's own package name (2018+ edition
    // path-clarity) addresses the package's LIBRARY, from any of its targets.
    if (crate.crateName !== undefined && root === crate.crateName) {
        const lib = crate.lib ?? { srcDir: crate.srcDir, rootFiles: crate.rootFiles ?? [] };
        return resolveFromModuleDir(lib.srcDir, rest, exists, rootContext(lib.srcDir, lib.rootFiles, declares));
    }
    // An in-repo path dependency of this crate → that crate's library tree.
    const dep = deps.dependencyFor?.(fromFile, root);
    if (dep !== undefined) {
        return resolveFromModuleDir(dep.srcDir, rest, exists, rootContext(dep.srcDir, dep.rootFiles, declares));
    }
    // External crate (std/core/alloc, third-party) — not a resolvable path.
    return undefined;
}
/** The crate-root name check: the deps' own, or "every name is declared" when absent. */
function declaresOf(deps) {
    return deps.rootDeclares ?? (() => true);
}
function rootContext(dir, files, declares) {
    return files === undefined || files.length === 0 ? undefined : { dir, files, declares };
}
/**
 * `super::…` / `self::…` — resolve relative to the importing file's MODULE.
 *
 * The importing file's module directory is the directory that would contain a child
 * module's file. For `src/a/b.rs` (module `crate::a::b`) the module's "own" directory
 * for `self::X` is `src/a/b/` (a submodule of b lives there) but b's items also live
 * in `b.rs` itself — so `self::X` probes both `src/a/b/X.rs`/`mod.rs` AND treats `X`
 * as an item of `b.rs`. For `src/a/mod.rs` (module `crate::a`) the module dir is
 * `src/a/`. `super::` climbs one module level: from `src/a/b.rs` (module `a::b`),
 * `super` is module `a`, whose dir is `src/a/` (and items live in `a.rs`/`a/mod.rs`).
 *
 * We model this as: derive the file's module DIRECTORY and its FILE-self candidates,
 * climb one directory level per leading `super`, then resolve the tail as a module
 * path under the resulting directory (with the longest-match item fallback).
 */
function resolveRelative(root, segments, fromFile, exists, deps) {
    const crate = deps.crateRootFor(fromFile);
    if (crate === undefined)
        return undefined;
    const srcDir = crate.srcDir;
    const fromPosix = toPosix(fromFile);
    const fromDir = path.posix.dirname(fromPosix);
    const baseName = path.posix.basename(fromPosix, '.rs');
    // The module directory of the importing file: for `mod.rs` and for a crate ROOT file
    // (`src/lib.rs`, `src/main.rs`, `src/bin/x.rs`, `tests/it.rs`, …) it is the file's own
    // directory; for `foo.rs` it is `<dir>/foo` (the dir that would hold foo's submodules).
    // This is the directory `self::` resolves against. Without target knowledge from the
    // deps, the legacy basename rule treats any `lib.rs` / `main.rs` as a root.
    const isRoot = crate.fileIsRoot ?? (baseName === 'lib' || baseName === 'main');
    let moduleDir = baseName === 'mod' || isRoot ? fromDir : path.posix.join(fromDir, baseName);
    // Count leading super/self segments. `self` consumes one segment and stays; each
    // `super` consumes one segment and climbs one module level.
    let i = 0;
    for (; i < segments.length; i++) {
        const seg = segments[i];
        if (seg === 'self') {
            // self only meaningfully appears first; treat as no climb.
            continue;
        }
        if (seg === 'super') {
            const parent = path.posix.dirname(moduleDir);
            if (!withinSrc(parent, srcDir))
                return undefined; // climbed above the crate root
            moduleDir = parent;
            continue;
        }
        break;
    }
    // `root` is the first segment; the loop above already consumed it (self/super). The
    // remaining tail starts at i.
    void root;
    const tail = segments.slice(i);
    return resolveFromModuleDir(moduleDir, tail, exists, rootContext(srcDir, crate.rootFiles, declaresOf(deps)));
}
/**
 * Resolve a module-relative tail (`['a','b','Sym']`) under a starting module
 * directory to a `.rs` file. Mirrors Rust's file layout with the longest-match
 * fallback for the case where the final segment(s) are ITEMS inside a module file
 * rather than submodules:
 *
 *   dir + a::b::Sym  → candidates, longest module-path first:
 *     <dir>/a/b/Sym.rs, <dir>/a/b/Sym/mod.rs        (Sym is a module)
 *     <dir>/a/b.rs,     <dir>/a/b/mod.rs            (Sym is an item in module a::b)
 *     <dir>/a.rs,       <dir>/a/mod.rs              (b::Sym are items in module a)
 *
 * Also the empty tail resolves to the module dir itself (`<dir>/mod.rs` is not used
 * here because `dir` already IS the module dir; the self/super caller handles that).
 * When the module dir IS the crate root (`root.dir`), the crate root module's file is the
 * crate root file: the empty tail binds the first existing `root.files` entry, and an item
 * tail binds the first root file that declares the item's name (`root.declares`).
 * The FIRST existing candidate wins. Any miss → undefined (silence).
 */
function resolveFromModuleDir(moduleDir, tail, exists, root) {
    const atRoot = root !== undefined && path.posix.normalize(moduleDir) === path.posix.normalize(root.dir);
    const segs = tail.filter((s) => s.length > 0);
    if (segs.length === 0) {
        // Path is just `crate`/`self`/the module itself → the module's own file.
        for (const cand of [joinUnder(moduleDir, 'mod.rs'), moduleDir + '.rs']) {
            if (cand !== undefined && exists(cand))
                return cand;
        }
        if (atRoot)
            return root.files.find((f) => exists(f));
        return undefined;
    }
    // Try the longest module-path prefix first, shrinking the module part as the tail
    // segments are reinterpreted as items. For each prefix length k (segs[0..k] as a
    // module path), probe `<dir>/<seg0..segk>.rs` and `.../mod.rs`.
    for (let k = segs.length; k >= 1; k--) {
        const modulePart = segs.slice(0, k).join('/');
        const fileCand = joinUnder(moduleDir, modulePart + '.rs');
        const modCand = joinUnder(moduleDir, modulePart + '/mod.rs');
        if (fileCand !== undefined && exists(fileCand))
            return fileCand;
        if (modCand !== undefined && exists(modCand))
            return modCand;
    }
    // Final fallback: the ENTIRE tail is items inside THIS module — the owning file is
    // the module dir's own file (`<dir>.rs` or `<dir>/mod.rs`). This covers e.g.
    // `super::Type` resolving against module `crate::a` whose file is `src/a.rs`.
    for (const cand of [moduleDir + '.rs', joinUnder(moduleDir, 'mod.rs')]) {
        if (cand !== undefined && exists(cand))
            return cand;
    }
    // The crate root module's items live in the crate root file — bound only when that file
    // really declares (or `use`s) the first item name, so a crate-root-namespace name defined
    // elsewhere (a `#[macro_export]` macro) is never pinned on the root file.
    if (atRoot)
        return root.files.find((f) => exists(f) && root.declares(f, segs[0]));
    return undefined;
}
/** Is `dir` within (or equal to) the crate `src` root? Guards `super::` climbing
 *  above the crate root, which is an external/invalid path → silence. */
function withinSrc(dir, srcDir) {
    const d = path.posix.normalize(dir);
    const s = path.posix.normalize(srcDir);
    if (s === '' || s === '.')
        return !d.startsWith('..');
    return d === s || d.startsWith(s + '/');
}
/** Join a repo-relative directory with a sub-path, normalizing; reject any path that
 *  escapes the repo root. '' → the sub-path itself. */
function joinUnder(dir, sub) {
    const joined = path.posix.normalize(dir === '' ? sub : path.posix.join(dir, sub));
    if (joined.startsWith('..'))
        return undefined;
    return joined;
}
function toPosix(p) {
    return p.replace(/\\/g, '/');
}
