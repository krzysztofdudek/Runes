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
        if (crate.unrooted === true)
            return undefined;
        return resolveFromModuleDir(crate.srcDir, rest, exists, rootContext(crate.srcDir, crate.rootFiles, declares, crate.rootsShared), moduleCheckOf(deps));
    }
    // A crate named for certain (`extern::<crate>`), or a `use` path whose first name an `extern crate` of its own scope binds (`extern::<crate>::as::<name>::…`). In edition 2015 the second is no exception to the rule that a `use` path starts at the crate root, so it is read as the path it was written as.
    if (root === 'extern') {
        const name = segments[1];
        if (name === undefined)
            return undefined;
        const aliased = segments[2] === 'as';
        if (aliased && crate.crateRelativeUses === true)
            return resolveBare(segments.slice(3), fromFile, exists, deps, crate);
        const named = crateNamed(name, fromFile, deps, crate);
        return named === undefined ? undefined : resolveFromModuleDir(named.srcDir, segments.slice(aliased ? 4 : 2), exists, rootContext(named.srcDir, named.rootFiles, declares), moduleCheckOf(deps));
    }
    // A `use` path whose first name is in scope where it is written (`use::<n>::<the n segments that name stands for>::<the path as written>`). From edition 2018 that name is what the path starts at; in edition 2015 a `use` path starts at the crate root whatever is in scope, so it is read as written.
    if (root === 'use') {
        const lead = Number(segments[1]);
        const written = segments.slice(2 + lead);
        if (!Number.isInteger(lead) || lead < 1 || written.length === 0)
            return undefined;
        if (crate.crateRelativeUses === true)
            return resolveBare(written, fromFile, exists, deps, crate);
        return resolveRustPath([...segments.slice(2, 2 + lead), ...written.slice(1)].join('::'), fromFile, exists, deps);
    }
    return resolveBare(segments, fromFile, exists, deps, crate);
}
/** The library tree the crate name `name` stands for in the package of `fromFile`: the package's own library (2018+ path clarity addresses it from any of its targets), else an in-repo path dependency. */
function crateNamed(name, fromFile, deps, crate) {
    if (crate.crateName !== undefined && name === crate.crateName && crate.lib !== null)
        return crate.lib ?? { srcDir: crate.srcDir, rootFiles: crate.rootFiles ?? [] };
    return deps.dependencyFor?.(fromFile, name);
}
/** Resolve a path that starts with a bare identifier (`segments`, not empty), as a `use` writes it. */
function resolveBare(segments, fromFile, exists, deps, crate) {
    const root = segments[0];
    if (root === undefined)
        return undefined;
    const rest = segments.slice(1);
    const declares = declaresOf(deps);
    const into = (tree) => resolveFromModuleDir(tree.srcDir, rest, exists, rootContext(tree.srcDir, tree.rootFiles, declares), moduleCheckOf(deps));
    const own = crate.crateName !== undefined && root === crate.crateName && crate.lib !== null ? (crate.lib ?? { srcDir: crate.srcDir, rootFiles: crate.rootFiles ?? [] }) : undefined;
    const declaresItem = (f, name) => (deps.rootDeclares?.(f, name, true) ?? true);
    if (crate.crateRelativeUses === true && deps.externCrateFor !== undefined) {
        // Edition 2015, with what each root binds at hand: the path is relative to the crate root. The package's own crate name aside, the first segment is what the first root that binds it makes of it: a crate it binds with `extern crate`, or a module or an item of its own. A path dependency that no root binds is not in reach of a `use`; the reserved crates stay external.
        if (own !== undefined)
            return into(own);
        const roots = crate.crateRelativeRoots ?? crate.rootFiles ?? [];
        for (const file of roots) {
            if (!exists(file))
                continue;
            const bound = deps.externCrateFor(fromFile, file, root);
            if (bound !== undefined)
                return into(bound);
            if (!EDITION_2015_EXTERNAL_ROOTS.has(root) && declaresItem(file, root))
                return resolveFromModuleDir(crate.srcDir, segments, exists, rootContext(crate.srcDir, roots, declaresItem, crate.rootsShared), moduleCheckOf(deps));
        }
        return undefined;
    }
    // A name the crate root binds with `extern crate` is in the extern prelude of every module of the crate.
    if (deps.externCrateFor !== undefined) {
        for (const file of crate.rootFiles ?? []) {
            const bound = exists(file) ? deps.externCrateFor(fromFile, file, root) : undefined;
            if (bound !== undefined)
                return into(bound);
        }
    }
    // The current crate's own package name (2018+ edition path-clarity) addresses the package's LIBRARY, from any of its targets.
    if (own !== undefined)
        return into(own);
    // An in-repo path dependency of this crate → that crate's library tree.
    const dep = deps.dependencyFor?.(fromFile, root);
    if (dep !== undefined)
        return into(dep);
    // Edition 2015 without the pass's symbol table: a `use` path is relative to the crate root, so `use a::b;` names the root's module `a`; no name is known to be an item of the root then, so nothing binds.
    if (crate.crateRelativeUses === true && !EDITION_2015_EXTERNAL_ROOTS.has(root)) {
        const rootFiles = crate.crateRelativeRoots ?? crate.rootFiles ?? [];
        if (rootFiles.some((f) => exists(f) && declaresItem(f, root)))
            return resolveFromModuleDir(crate.srcDir, segments, exists, rootContext(crate.srcDir, rootFiles, declaresItem, crate.rootsShared), moduleCheckOf(deps));
    }
    // External crate (std/core/alloc, third-party) — not a resolvable path.
    return undefined;
}
/** The symbol key under which the Rust extractor declares `name` for a file whose top level binds it as an item (an item the file defines there, one an `extern` block or a known item macro defines there, or a name a top-level `use` brings in). It is what an edition 2015 `use` path from the crate root can name in that file when the file is the crate root; the key's `item:` prefix keeps it apart from the extractor's other declarations and can never be a Rust identifier. */
export function rustTopLevelItemKey(name) {
    return `item:${name}`;
}
/** The symbol key under which the Rust extractor declares `name` for a file whose top level binds it with `extern crate` (the alias of `extern crate a as name;`, else the crate of `extern crate name;`). Such a name is a name of the file's module that a `crate::` path, or a path into a dependency, can go through (`pub extern crate inner as name;` in a facade), and no item an edition 2015 `use` path names. The `extern:` prefix can never be a Rust identifier. */
export function rustExternNameKey(name) {
    return `extern:${name}`;
}
/** The symbol key under which the Rust extractor declares, for a file whose top level writes `extern crate <crate> as <name>;` or `extern crate <name>;`, that `name` stands for the crate `crate` there (both as written in code, with `r#` stripped). A table answers only whether a key is declared, so the resolver asks it for each crate the importing package can name. */
export function rustExternBindingKey(name, crate) {
    return `extern:${name}=${crate}`;
}
/** The symbol key under which the Rust extractor declares, for a file, a module that the file places in a file of its own by name alone: a `mod x;` with no `path` attribute and no macro around it. `modulePath` is the module's names from the declaring file's own module, joined by `/` (`x`, or `outer/x` for one inside the inline module `outer`). A declaration that a `cfg` may remove (`conditional`) has a key of its own, `modfile?:<path>`, so it is never taken for one that always holds, `modfile:<path>`. Neither prefix can be a Rust identifier. */
export function rustModuleFileKey(modulePath, conditional = false) {
    return `${conditional ? 'modfile?' : 'modfile'}:${modulePath}`;
}
/** The symbol key under which the Rust extractor declares, for a file, a module whose names a top-level glob `use` of the file brings into the file's own module: `path` is the glob's path as written, without the `::*` and with `r#` stripped (`types`, `self::types`, `crate::a::b`). In a crate root, where `self` and `crate` are the same module and a bare first name is a module the root declares, the three spellings name the module at that path below the root. The `glob:` prefix can never be a Rust identifier. */
export function rustGlobKey(path) {
    return `glob:${path}`;
}
/** The symbol key under which the Rust extractor declares, for a file, a module the file declares without a body (`mod x;`), whatever stands in front of it and also in a `cfg_if!` branch. `modulePath` is the module's names from the declaring file's own module, joined by `/` (`x`, or `outer/x` for one inside the inline module `outer`). It says that the name is a module with a file of its own, not where that file is. The `mod:` prefix can never be a Rust identifier. */
export function rustModuleKey(modulePath) {
    return `mod:${modulePath}`;
}
/** The symbol key the Rust extractor declares for a file whose `rustModuleKey` declarations are all the modules it declares without a body: the file parsed to the end and invokes no macro, among its items, that could declare another. Without it a module the file does not list is not known to be absent. It can never be a Rust identifier. */
export const RUST_MODULES_KNOWN_KEY = 'mods:all';
/** Crates every edition 2015 crate root has in scope without a module of its own to shadow them. */
const EDITION_2015_EXTERNAL_ROOTS = new Set(['std', 'core', 'alloc', 'proc_macro', 'test']);
/** The crate-root name check: the deps' own, or "every name is declared" when absent. */
function declaresOf(deps) {
    return deps.rootDeclares ?? (() => true);
}
function rootContext(dir, files, declares, shared = false) {
    return files === undefined || files.length === 0 ? undefined : { dir, files, declares, shared };
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
    // A module of a crate that cannot be told reaches the crate root by climbing out of the tree's first level, and which crate's root that is, is not known; below it the path is the same in every crate.
    if (crate.unrooted === true && path.posix.normalize(moduleDir) === path.posix.normalize(srcDir))
        return undefined;
    return resolveFromModuleDir(moduleDir, tail, exists, rootContext(srcDir, crate.rootFiles, declaresOf(deps), crate.rootsShared), moduleCheckOf(deps));
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
 * tail binds the first root file that declares the item's name (`root.declares`); when the root
 * files are crates that all compile the importing file (`root.shared`) neither binds.
 * The FIRST existing candidate wins. Any miss → undefined (silence).
 */
function resolveFromModuleDir(moduleDir, tail, exists, root, modules) {
    const atRoot = root !== undefined && path.posix.normalize(moduleDir) === path.posix.normalize(root.dir);
    const segs = tail.filter((s) => s.length > 0);
    if (segs.length === 0) {
        // Path is just `crate`/`self`/the module itself → the module's own file.
        for (const cand of [joinUnder(moduleDir, 'mod.rs'), moduleDir + '.rs']) {
            if (cand !== undefined && exists(cand))
                return cand;
        }
        if (atRoot)
            return rootFileFor(root, exists, () => true);
        return undefined;
    }
    // Try the longest module-path prefix first, shrinking the module part as the tail
    // segments are reinterpreted as items. For each prefix length k (segs[0..k] as a
    // module path), probe `<dir>/<seg0..segk>.rs` and `.../mod.rs`.
    for (let k = segs.length; k >= 1; k--) {
        const modulePart = segs.slice(0, k).join('/');
        const found = [joinUnder(moduleDir, modulePart + '.rs'), joinUnder(moduleDir, modulePart + '/mod.rs')].filter((c) => c !== undefined && exists(c));
        if (found.length === 0)
            continue;
        // A file that fits the name is the module only when a module above it declares it. Where the files above are known to declare none, the name is an item of the module above; where nothing is known, the file is taken, unless it is another target's root.
        const declared = modules === undefined ? undefined : moduleIsDeclared(moduleDir, segs, k, exists, atRoot ? root.files : undefined, modules);
        if (declared === false)
            continue;
        const file = declared === true ? found[0] : found.find((c) => modules?.isTargetRoot(c) !== true);
        if (file !== undefined)
            return file;
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
        return rootFileFor(root, exists, (f) => root.declares(f, segs[0]));
    return undefined;
}
/** The module check of `deps`, or none when they know no file's modules (a call without the pass's table), where a path resolves as it did before any was known. */
function moduleCheckOf(deps) {
    const declared = deps.moduleDeclared;
    return declared === undefined ? undefined : { declared: (file, modulePath) => declared(file, modulePath), isTargetRoot: (file) => deps.crateRootFor(file)?.fileIsRoot === true };
}
/** Whether the module `segs[0..k]` below the module directory `moduleDir` is declared by a file of a module above it: the file of `segs[0..j]` for some `j < k`, which declares it through its inline modules `segs[j..k-1]`, down to the files of the module at `moduleDir` itself (`rootFiles` when that is the crate root). True when one declares it, false when at least one such file exists and each that exists is known not to, undefined otherwise. */
function moduleIsDeclared(moduleDir, segs, k, exists, rootFiles, modules) {
    let answered = false;
    let unknown = false;
    for (let j = k - 1; j >= 0; j--) {
        const above = segs.slice(0, j).join('/');
        const files = j > 0 ? [joinUnder(moduleDir, above + '.rs'), joinUnder(moduleDir, above + '/mod.rs')] : (rootFiles ?? [moduleDir + '.rs', joinUnder(moduleDir, 'mod.rs')]);
        for (const file of files) {
            if (file === undefined || !exists(file))
                continue;
            const declares = modules.declared(file, segs.slice(j, k).join('/'));
            if (declares === true)
                return true;
            if (declares === undefined)
                unknown = true;
            else
                answered = true;
        }
    }
    return answered && !unknown ? false : undefined;
}
/** The crate-root file of `root` that holds the name `fits` asks about: the first existing one that does. None when the root files are crates that all compile the importing file (`root.shared`): `crate::` is a different root in each, and which one a root item is cannot be told. */
function rootFileFor(root, exists, fits) {
    return root.shared ? undefined : root.files.find((f) => exists(f) && fits(f));
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
