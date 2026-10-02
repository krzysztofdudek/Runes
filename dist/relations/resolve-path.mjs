import path from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolveTsPath, makeTsResolveDeps } from './extractors/typescript-resolve.mjs';
import { makePythonResolver } from './extractors/python-resolve.mjs';
import { resolveGoImport } from './extractors/go-resolve.mjs';
import { resolveJavaFqn, resolveJavaPackageFiles } from './extractors/java-resolve.mjs';
import { resolvePhpFqn, parseComposerAutoload } from './extractors/php-resolve.mjs';
import { resolveRustPath } from './extractors/rust-resolve.mjs';
import { resolveIncludePath } from './extractors/include-resolve.mjs';
import { resolveRubyRequireRelative } from './extractors/ruby-resolve.mjs';
import { makeRepoLayout } from './repo-layout.mjs';
import { makeExactCaseCheck } from './exact-case.mjs';
/** Production resolvePathToFile: dispatches by language to the per-language path resolver.
 *  Checks existence against the project's files on disk. Symbol-resolved languages (and
 *  not-yet-implemented ones) return undefined here — they resolve via the SymbolTable.
 *
 *  `ownerOf` and `isExcluded`, when supplied, feed every resolver below that can face
 *  MORE THAN ONE candidate file for a single specifier. Go and Java package imports use
 *  `isExcluded` to drop an excluded file from the package's candidate list BEFORE `ownerOf`
 *  is ever asked about it — the package's split-or-single-owner status is decided from what
 *  remains, not from every file the directory happens to hold. Python (multiple ancestor
 *  source roots matching the same dotted module) and PHP (multiple PSR-4 base directories
 *  for one prefix) face the same shape of ambiguity without an owner-set to collapse: their
 *  resolvers use `isExcluded` to drop an excluded match from the candidate SET before
 *  deciding whether resolution is ambiguous, so an excluded duplicate can no longer keep a
 *  real, surviving candidate silenced. Java's own ancestor-source-root search (both a precise
 *  type import and a wildcard package import) is nearest-first-wins rather than
 *  collect-then-decide, so it applies `isExcluded` differently: an excluded hit is treated as
 *  though it does not exist, so the walk keeps climbing to the next candidate — same root,
 *  then further-out roots — instead of letting an excluded nearer copy end the search before
 *  the farther, still-live copy is ever tried (see java-resolve.ts's own doc comment). Either
 *  way this is what keeps an exclusion honest about every OTHER file: excluding one file can
 *  only remove that file's own contribution to the decision — it can never fabricate an owner
 *  or a target a surviving file never had, and it can never bury a real dependency reached
 *  through a file that is still there. A caller resolving a specifier fresh from source — the
 *  specifier can name any file on disk, excluded or not — must supply both `ownerOf` and an `isExcluded` built from the same exclusion set instead of calling this with `ownerOf` and no `isExcluded`:
 *  without `isExcluded`, an excluded file still counts toward the ambiguity decision (or, for
 *  Java, still wins the walk), which can silence a real cross-owner dependency reached through
 *  the surviving, non-excluded, fully enforced candidate. */
export function makeResolvePathToFile(projectRoot, ownerOf, isExcluded) {
    // A candidate exists only under the name its directory lists: on a case-insensitive file system existsSync would also find lib/root.rs as lib/Root.rs (issue 482).
    const exactCase = makeExactCaseCheck(projectRoot);
    const exists = (repoRelPosix) => existsSync(path.resolve(projectRoot, repoRelPosix)) && exactCase(repoRelPosix);
    const goDeps = makeGoResolveDeps(projectRoot, ownerOf, isExcluded, exactCase);
    const javaDeps = makeJavaResolveDeps(projectRoot, exists, isExcluded, exactCase);
    const layout = makeRepoLayout(projectRoot, isExcluded);
    const phpDeps = makePhpResolveDeps(projectRoot, exists, isExcluded, layout.composerMaps);
    const rustDeps = makeRustResolveDeps(projectRoot, exists);
    // One Python resolver for the whole pass: it memoizes its probes and indexes the discovered roots by the names they hold (issue 013).
    const python = makePythonResolver(exists, isExcluded, makePythonProjectRoots(projectRoot, isExcluded), (repoRelPosix) => {
        try {
            return readdirSync(path.join(projectRoot, repoRelPosix));
        }
        catch {
            return undefined;
        }
    });
    // TS/JS: a candidate is a FILE (a directory named like `./x.config` is never a module), and
    // non-relative specifiers read tsconfig `paths`/`baseUrl` and in-repo package.json files.
    const isFile = (repoRelPosix) => {
        try {
            return statSync(path.resolve(projectRoot, repoRelPosix)).isFile() && exactCase(repoRelPosix);
        }
        catch {
            return false;
        }
    };
    const tsDeps = makeTsResolveDeps(projectRoot, isExcluded);
    return (specifier, fromFile, language, isPackage = false) => {
        if (language === 'typescript' || language === 'tsx' || language === 'javascript') {
            return resolveTsPath(specifier, fromFile, isFile, tsDeps);
        }
        if (language === 'python') {
            return python(specifier, fromFile);
        }
        if (language === 'go') {
            return resolveGoImport(specifier, fromFile, goDeps);
        }
        if (language === 'java') {
            if (isPackage) {
                // Wildcard package import: `resolveJavaPackageFiles` already committed to the
                // first ANCESTOR ROOT with at least one LIVE (non-excluded) file — an
                // excluded-only root is skipped exactly like an empty one (see
                // java-resolve.ts's own doc comment) — so `files` here is already the live set
                // to decide ownership over. Exactly one distinct owner among them → attribute
                // one of its files; 2+ distinct owners → still split → silence.
                //
                // No `sole` owner found covers TWO different situations: `files` is empty (the
                // package was found nowhere live — `files[0]` is naturally `undefined`, the
                // same silence a wholly-unmapped package gets), or `files` is non-empty but no
                // owner claims any of it (a package no unit owns has no owner for ANY file — an
                // ordinary case, not the exception). The fallback picks `files[0]` either way rather than
                // returning `undefined` outright: a caller that is not the owner index
                // (a lookup by another grouping) still needs a live, non-excluded file to find the
                // package's matched type — silencing unconditionally here made every wildcard
                // import into an unowned package invisible to that lookup, exclusion or not.
                const files = resolveJavaPackageFiles(specifier, fromFile, javaDeps);
                let sole;
                for (const f of files) {
                    const owner = ownerOf?.(f);
                    if (owner === undefined)
                        continue; // unmapped file is not part of the owner set
                    if (sole === undefined) {
                        sole = owner;
                    }
                    else if (owner !== sole) {
                        return undefined; // 2+ distinct owners among the live set → split package → silence
                    }
                }
                if (sole === undefined)
                    return files[0];
                const soleOwned = files.filter((f) => ownerOf?.(f) === sole);
                return soleOwned[0];
            }
            return resolveJavaFqn(specifier, fromFile, javaDeps);
        }
        if (language === 'php') {
            return resolvePhpFqn(specifier, fromFile, phpDeps);
        }
        if (language === 'rust') {
            return resolveRustPath(specifier, fromFile, exists, rustDeps);
        }
        if (language === 'c' || language === 'cpp') {
            // C and C++ share ONE include resolver: a quoted include resolves next to the
            // includer first, then under the include roots — a compile_commands.json's -iquote/-I
            // roots when one exists, else a conservative probe of the repository root and every
            // `include/` directory — with the exactly-one-hit rule (see include-resolve.ts's own
            // doc comment). An angle include resolves only under a database's -I roots. The
            // header's owner is the dependency target (header and implementation share an owner).
            return resolveIncludePath(specifier, fromFile, exists, layout.includeRoots);
        }
        if (language === 'ruby') {
            // Ruby's ONLY path-precise link: `require_relative '<lit>'` resolves relative to the
            // requiring file's directory (`.rb` appended). Constant references carry no path —
            // they route through the SymbolTable, so they never reach this branch.
            return resolveRubyRequireRelative(specifier, fromFile, exists);
        }
        return undefined;
    };
}
/**
 * Build the disk-backed Rust resolution capabilities for a project root. A Rust path
 * (`crate::a::b`) resolves through a crate's module tree. The PACKAGE is the nearest
 * ancestor of the importing file that contains a `Cargo.toml`; which CRATE of that package
 * the file belongs to follows Cargo's target auto-discovery (`src/lib.rs` / `src/main.rs`
 * for `src/**`, `src/bin/<x>.rs` and `src/bin/<x>/main.rs`, `tests/`, `examples/`,
 * `benches/`, `build.rs`, each of the last three unless `[package]` turns its discovery off) and the `path` of each `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` table, written as tables or inline — see `rustTargetFor`. The package's crate name (`[lib].name`,
 * else `[package].name`, hyphens → underscores) addresses its library from any target.
 *
 * In-repo PATH DEPENDENCIES (`[dependencies]`, `[dev-dependencies]`,
 * `[build-dependencies]` and their `[target.*]` forms; inline `{ path = … }`, the
 * `[dependencies.<name>]` table form, the whole table as one inline table, and `{ workspace = true }` inherited from the nearest
 * `[workspace.dependencies]`) map the name code uses (`package =` renames honoured) to that
 * crate's library tree. A path that leaves the repository, or points at a directory with no
 * Cargo.toml, is ignored.
 *
 * Every manifest and crate-root file is read at most once per factory instance (cached) —
 * they are stable across one pass. No Cargo.toml ancestor → undefined crate root, which the
 * resolver treats as silence (it never guesses a source root).
 *
 * NOTE: makeResolvePathToFile's deps are pure filesystem access;
 * reading Cargo.toml / a crate-root file there is fine — it reads a file, it does not parse
 * source into a tree.
 */
function makeRustResolveDeps(projectRoot, exists) {
    // Cache: directory (repo-rel POSIX, '' = root) → the Cargo.toml read there (null = none).
    const manifestByDir = new Map();
    // Cache: directory → the nearest Cargo.toml directory at or above it (null = none).
    const packageDirByDir = new Map();
    // Cache: crate-root file → its text with comments stripped ('' when unreadable).
    const rootTextByFile = new Map();
    function manifestAt(dir) {
        if (!manifestByDir.has(dir)) {
            let text;
            try {
                text = readFileSync(path.join(projectRoot, dir, 'Cargo.toml'), 'utf-8');
            }
            catch {
                text = undefined;
            }
            manifestByDir.set(dir, text === undefined ? null : parseCargoManifest(text));
        }
        return manifestByDir.get(dir) ?? undefined;
    }
    /** The nearest directory at or above `dir` holding a Cargo.toml, or undefined. */
    function packageDirFrom(dir) {
        const visited = [];
        let cur = dir;
        let found = null;
        for (;;) {
            const cached = packageDirByDir.get(cur);
            if (cached !== undefined) {
                found = cached;
                break;
            }
            visited.push(cur);
            if (existsSync(path.join(projectRoot, cur, 'Cargo.toml'))) {
                found = cur;
                break;
            }
            if (cur === '')
                break;
            const parent = path.posix.dirname(cur);
            cur = parent === '.' ? '' : parent;
        }
        for (const v of visited)
            packageDirByDir.set(v, found);
        return found ?? undefined;
    }
    function dirOf(file) {
        const d = path.posix.dirname(toPosix(file));
        return d === '.' ? '' : d;
    }
    function under(dir, sub) {
        const joined = path.posix.normalize(dir === '' ? sub : path.posix.join(dir, sub));
        if (joined === '..' || joined.startsWith('../') || path.posix.isAbsolute(joined))
            return undefined;
        return joined === '.' ? '' : joined;
    }
    /** The library tree of the package at `pkgDir`. */
    function libTreeOf(pkgDir, manifest) {
        const rootFile = under(pkgDir, manifest?.libPath ?? 'src/lib.rs') ?? under(pkgDir, 'src/lib.rs');
        return { srcDir: dirOf(rootFile), rootFiles: [rootFile] };
    }
    function crateRootFor(fromFile) {
        const file = toPosix(fromFile);
        const pkgDir = packageDirFrom(dirOf(file));
        if (pkgDir === undefined)
            return undefined;
        const manifest = manifestAt(pkgDir);
        const crateName = manifest?.crateName;
        const lib = libTreeOf(pkgDir, manifest);
        const rel = pkgDir === '' ? file : file.slice(pkgDir.length + 1);
        // Target sub-paths are package-relative and never climb, so a plain join is exact.
        const at = (sub) => (pkgDir === '' || sub === '' ? pkgDir + sub : `${pkgDir}/${sub}`);
        const target = rustTargetFor(rel, (sub) => exists(at(sub)), manifest?.libPath, manifest?.targetPaths, manifest?.undiscoveredDirs, manifest?.namedTargets);
        return {
            srcDir: at(target.srcDir),
            crateName,
            rootFiles: target.rootFiles.map(at),
            fileIsRoot: target.fileIsRoot,
            lib,
        };
    }
    function dependencyFor(fromFile, name) {
        const pkgDir = packageDirFrom(dirOf(toPosix(fromFile)));
        if (pkgDir === undefined)
            return undefined;
        const manifest = manifestAt(pkgDir);
        if (manifest === undefined)
            return undefined;
        for (const [key, spec] of manifest.dependencies) {
            let depDir;
            let rename = spec.package;
            if (spec.path !== undefined) {
                depDir = under(pkgDir, spec.path);
            }
            else if (spec.workspace) {
                // `{ workspace = true }` → the nearest ancestor manifest with a matching
                // `[workspace.dependencies]` entry; its path is relative to that manifest.
                let cur = pkgDir;
                while (cur !== undefined) {
                    const ws = manifestAt(cur);
                    const inherited = ws?.workspaceDependencies.get(key);
                    if (inherited !== undefined) {
                        if (inherited.path !== undefined)
                            depDir = under(cur, inherited.path);
                        rename = rename ?? inherited.package;
                        break;
                    }
                    if (cur === '')
                        break;
                    const parent = path.posix.dirname(cur);
                    cur = packageDirFrom(parent === '.' ? '' : parent);
                }
            }
            if (depDir === undefined)
                continue; // registry / git / out-of-repo → external
            const depManifest = manifestAt(depDir);
            if (depManifest === undefined)
                continue; // no Cargo.toml there → not a crate
            // The name code uses: the dependency key when renamed with `package =`, else the
            // target library's own crate name.
            const codeName = rename !== undefined ? normalizeCrateName(key) : (depManifest.crateName ?? normalizeCrateName(key));
            if (codeName !== name)
                continue;
            return libTreeOf(depDir, depManifest);
        }
        return undefined;
    }
    function rootDeclares(rootFile, name) {
        let text = rootTextByFile.get(rootFile);
        if (text === undefined) {
            try {
                text = stripRustComments(readFileSync(path.join(projectRoot, rootFile), 'utf-8'));
            }
            catch {
                text = '';
            }
            rootTextByFile.set(rootFile, text);
        }
        return rustFileDeclares(text, name);
    }
    return { crateRootFor, dependencyFor, rootDeclares };
}
/** Which Cargo target a package-relative `.rs` path belongs to, following Cargo's target
 *  auto-discovery. `srcDir` is the target's module-tree root and `rootFiles` its crate-root
 *  files in probe order (both package-relative); `fileIsRoot` says whether `rel` IS the
 *  root. A shared helper under `tests/` (`tests/common/mod.rs`) belongs to whichever test
 *  crate declares it, so it gets the `tests/` tree with no root file to bind items to.
 *
 *  `targetPaths` are the `path`s of the manifest's `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` tables. Such a file is the root of its own crate, wherever it lies (ripgrep's `crates/core/main.rs`). A file outside `src/` belongs to the tree of the root whose directory is the deepest one holding it, a target's path or the library's path alike, not to the `src/` tree that holds no part of it; below `tests/`, `examples/` or `benches/` an auto-discovered `<dir>/<name>/main.rs` competes too. In that directory the library's root is probed first and one other root after it, as `src/lib.rs` before `src/main.rs`; two or more other roots there give none, since which of them declares the file's module cannot be told (as for `tests/common/`). A file under `src/` keeps the auto-discovered targets, so a `[[bin]]` that names `src/main.rs` changes nothing for the library beside it, and a library whose path lies outside `src/` is no root of a `src/` file, which is a module of `src/main.rs`.
 *
 *  `undiscoveredDirs` are the directories among `tests`, `examples` and `benches` whose auto-discovery the manifest turns off (`autotests = false`, …): there only declared targets are crates, a target's `path` or, for one that gives only a name (`namedTargets`, `<dir>/<name>`), `<dir>/<name>.rs` or `<dir>/<name>/main.rs` as Cargo infers it, and every other file belongs to the deepest root holding it, as a file outside `src/` does, or to no root. */
export function rustTargetFor(rel, existsInPackage, libPath, targetPaths = [], undiscoveredDirs = [], namedTargets = []) {
    const targets = [...new Set(targetPaths.map((p) => path.posix.normalize(p)))];
    const dirOfRoot = (root) => (path.posix.dirname(root) === '.' ? '' : path.posix.dirname(root));
    if (targets.includes(rel))
        return { srcDir: dirOfRoot(rel), rootFiles: [rel], fileIsRoot: true };
    const libRoot = path.posix.normalize(libPath ?? 'src/lib.rs');
    // The tree of the deepest directory that holds `rel` and one of `roots` (below `floor` when given), or undefined.
    const deepestTree = (roots, floor) => {
        let dir;
        for (const root of roots) {
            const d = dirOfRoot(root);
            if ((d === '' || rel.startsWith(`${d}/`)) && (floor === undefined || d.startsWith(`${floor}/`)) && (dir === undefined || d.length > dir.length))
                dir = d;
        }
        if (dir === undefined)
            return undefined;
        const others = [...new Set(roots.filter((r) => r !== libRoot && dirOfRoot(r) === dir))];
        const rootFiles = [...(roots.includes(libRoot) && dirOfRoot(libRoot) === dir ? [libRoot] : []), ...(others.length === 1 ? others : [])];
        return { srcDir: dir, rootFiles, fileIsRoot: false };
    };
    const segs = rel.split('/');
    if (segs[0] === 'src' && segs[1] === 'bin' && segs.length >= 3) {
        if (segs.length === 3)
            return { srcDir: 'src/bin', rootFiles: [rel], fileIsRoot: true };
        const dir = `src/bin/${segs[2]}`;
        const main = `${dir}/main.rs`;
        return { srcDir: dir, rootFiles: [main], fileIsRoot: rel === main };
    }
    if ((segs[0] === 'tests' || segs[0] === 'examples' || segs[0] === 'benches') && segs.length >= 2 && undiscoveredDirs.includes(segs[0])) {
        const named = namedTargets.filter((n) => n.startsWith(`${segs[0]}/`) && !n.slice(segs[0].length + 1).includes('/')).flatMap((n) => [`${n}.rs`, `${n}/main.rs`]).filter(existsInPackage);
        if (named.includes(rel))
            return { srcDir: dirOfRoot(rel), rootFiles: [rel], fileIsRoot: true };
        return deepestTree([libRoot, ...named, ...targets]) ?? { srcDir: segs[0], rootFiles: [], fileIsRoot: false };
    }
    if ((segs[0] === 'tests' || segs[0] === 'examples' || segs[0] === 'benches') && segs.length >= 2) {
        if (segs.length === 2)
            return { srcDir: segs[0], rootFiles: [rel], fileIsRoot: true };
        const main = `${segs[0]}/${segs[1]}/main.rs`;
        if (rel === main)
            return { srcDir: dirOfRoot(main), rootFiles: [main], fileIsRoot: true };
        return deepestTree([libRoot, ...(existsInPackage(main) ? [main] : []), ...targets], segs[0]) ?? { srcDir: segs[0], rootFiles: [], fileIsRoot: false };
    }
    if (rel === 'build.rs')
        return { srcDir: '', rootFiles: [rel], fileIsRoot: true };
    const mainRoot = 'src/main.rs';
    if (rel === libRoot || rel === mainRoot)
        return { srcDir: path.posix.dirname(rel), rootFiles: [rel], fileIsRoot: true };
    if (segs[0] !== 'src') {
        const tree = deepestTree([libRoot, ...targets]);
        if (tree !== undefined)
            return tree;
    }
    return { srcDir: 'src', rootFiles: [...(libRoot.startsWith('src/') ? [libRoot] : []), mainRoot], fileIsRoot: false };
}
function normalizeCrateName(name) {
    return name.replace(/-/g, '_');
}
/** The names of the per-package dependency tables, each bare or under `target.<cfg>`. */
const DEP_TABLE_NAMES = new Set(['dependencies', 'dev-dependencies', 'dev_dependencies', 'build-dependencies', 'build_dependencies']);
/** Where a full key path (the table header's segments, then the line's key segments) lands among dependency entries: in `[workspace.dependencies]` or in a package's dependency tables, which crate, and the field path below that crate (empty when the path is the crate's whole value). Undefined for a path that names no crate of a dependency table. */
function dependencyEntryAt(keyPath) {
    if (keyPath[0] === 'workspace' && keyPath[1] === 'dependencies') {
        return keyPath.length > 2 ? { workspace: true, crate: keyPath[2], field: keyPath.slice(3) } : undefined;
    }
    const table = keyPath[0] === 'target' ? 2 : 0;
    if (!DEP_TABLE_NAMES.has(keyPath[table]) || keyPath.length <= table + 1)
        return undefined;
    return { workspace: false, crate: keyPath[table + 1], field: keyPath.slice(table + 2) };
}
/** Whether a key path lies above the crates of a dependency table, so a table written there as an inline table can hold dependency entries: a dependency table itself (`dependencies`, `target.<cfg>.dev-dependencies`, `workspace.dependencies`), or `target`, `target.<cfg>` or `workspace`. */
function holdsDependencyEntries(keyPath) {
    if (keyPath[0] === 'workspace')
        return keyPath.length === 1 || (keyPath.length === 2 && keyPath[1] === 'dependencies');
    const table = keyPath[0] === 'target' ? 2 : 0;
    return keyPath.length <= table || (keyPath.length === table + 1 && DEP_TABLE_NAMES.has(keyPath[table]));
}
/** A physical line that opens a table header (`[name]`, `[name.…]`, `[[name]]`): a bare first segment, then dotted segments, then the closing bracket. Joining stops at one, so a bracket left open in invalid TOML loses its own entry instead of swallowing the next table. A nested array element such as `["a", "b"]` or `[1, 2]` does not match. */
const TOML_HEADER_LINE = /^[ \t]*\[\[?[ \t]*[A-Za-z0-9_-]+(?:[ \t]*\.[ \t]*(?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*'))*[ \t]*\]\]?[ \t]*(?:#.*)?$/;
/** The index just past the TOML string that opens at `i`: basic (`"…"`, escapes), literal (`'…'`), or their multi-line forms (`"""…"""`, `'''…'''`). A one-line string left open ends at the line's end. */
function tomlStringEnd(text, i) {
    const c = text[i];
    const multi = text.startsWith(c.repeat(3), i);
    const close = multi ? c.repeat(3) : c;
    let j = i + close.length;
    while (j < text.length) {
        if (!multi && text[j] === '\n')
            break;
        if (c === '"' && text[j] === '\\' && (multi || text[j + 1] !== '\n'))
            j += 2;
        else if (text.startsWith(close, j)) {
            j += close.length;
            // Up to two quotes right before the closing delimiter of a multi-line string are its content.
            for (let extra = 0; multi && extra < 2 && text[j] === c; extra++)
                j++;
            break;
        }
        else
            j++;
    }
    return j;
}
/** The value of the TOML string `value` (trimmed) when it is exactly one string: basic with its escapes, literal, or either multi-line form, whose newline right after the opening delimiter is dropped and in which a backslash ending a line of a basic string trims the whitespace and newlines after it. Undefined for any other value, and for a string left open, followed by more text, or holding an escape TOML does not define. */
function tomlString(value) {
    const v = value.trim();
    const q = v[0];
    if (q !== '"' && q !== "'")
        return undefined;
    const multi = v.startsWith(q.repeat(3));
    const close = multi ? q.repeat(3) : q;
    let i = close.length;
    if (multi && v[i] === '\n')
        i++;
    let out = '';
    while (i < v.length) {
        if (v.startsWith(close, i)) {
            // Up to two quotes right before the closing delimiter of a multi-line string are its content.
            let extra = 0;
            while (multi && extra < 2 && v[i + close.length + extra] === q)
                extra++;
            return i + close.length + extra === v.length ? out + q.repeat(extra) : undefined;
        }
        const c = v[i];
        if (c === '\n' && !multi)
            return undefined;
        if (c !== '\\' || q === "'") {
            out += c;
            i++;
            continue;
        }
        const e = v[i + 1] ?? '';
        const simple = 'btnfre"\\'.indexOf(e);
        const hex = e === 'u' ? 4 : e === 'U' ? 8 : e === 'x' ? 2 : 0;
        if (e !== '' && simple !== -1) {
            out += '\b\t\n\f\r\x1b"\\'[simple];
            i += 2;
        }
        else if (hex > 0) {
            const digits = v.slice(i + 2, i + 2 + hex);
            const code = /^[0-9A-Fa-f]+$/.test(digits) && digits.length === hex ? parseInt(digits, 16) : -1;
            if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
                return undefined;
            out += String.fromCodePoint(code);
            i += 2 + hex;
        }
        else if (multi && /^\\[ \t]*\n/.test(v.slice(i))) {
            i++;
            while (v[i] === ' ' || v[i] === '\t' || v[i] === '\n')
                i++;
        }
        else
            return undefined;
    }
    return undefined;
}
/** Cargo.toml text as logical lines, comments dropped. A line whose brackets stay open (a multi-line array, also inside an inline table) or whose multi-line string does not close there continues on the next lines, joined with spaces, so the fields after `features = [ … ]` spread over lines stay on the entry's line; joining stops before a line that opens a table header. Brackets and `#` inside a string are plain text, and a multi-line string keeps its newlines, so `tomlString` reads its value as TOML does. A CRLF line ending is a newline, as TOML defines it. */
function tomlLogicalLines(source) {
    const text = source.replace(/\r\n/g, '\n');
    const lines = [];
    let line = '';
    let depth = 0;
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (c === '\n') {
            const end = depth > 0 ? text.indexOf('\n', i + 1) : -1;
            if (depth > 0 && !TOML_HEADER_LINE.test(text.slice(i + 1, end === -1 ? undefined : end)))
                line += ' ';
            else {
                lines.push(line);
                line = '';
                depth = 0;
            }
            i++;
        }
        else if (c === '#') {
            while (i < text.length && text[i] !== '\n')
                i++;
        }
        else if (c === '"' || c === "'") {
            const j = tomlStringEnd(text, i);
            line += text.slice(i, j);
            i = j;
        }
        else {
            if (c === '[' || c === '{')
                depth++;
            else if ((c === ']' || c === '}') && depth > 0)
                depth--;
            line += c;
            i++;
        }
    }
    lines.push(line);
    return lines;
}
/** The members of the inline table `value` (`{ a = 1, b.c = { … } }`), each as its key and value text, split at the table's own commas: strings and nested brackets stay whole, and an empty member (a trailing comma) is skipped. A table left open (a line whose join stopped early at a line that only looks like a header) gives the members written before the cut. Undefined when `value` is no inline table. */
function inlineTableMembers(value) {
    const v = value.trim();
    if (!v.startsWith('{'))
        return undefined;
    const end = v.endsWith('}') ? v.length - 1 : v.length;
    const members = [];
    let depth = 0;
    let start = 1;
    for (let i = 1; i < end; i++) {
        const c = v[i];
        if (c === '"' || c === "'")
            i = tomlStringEnd(v, i) - 1;
        else if (c === '[' || c === '{')
            depth++;
        else if (c === ']' || c === '}')
            depth--;
        else if (c === ',' && depth === 0) {
            members.push(v.slice(start, i).trim());
            start = i + 1;
        }
    }
    members.push(v.slice(start, end).trim());
    return members.filter((m) => m !== '');
}
/** The target tables whose array elements (`[[bin]]`, `[[test]]`, `[[example]]`, `[[bench]]`) can name a crate root with `path`. */
const TARGET_TABLES = new Set(['bin', 'test', 'example', 'bench']);
/** The directory Cargo discovers each kind of target in, and the `[package]` key that turns that discovery off. `[[bin]]` (`src/bin/`, `autobins`) is not read. */
const DISCOVERED_DIRS = {
    test: { dir: 'tests', flag: 'autotests' },
    example: { dir: 'examples', flag: 'autoexamples' },
    bench: { dir: 'benches', flag: 'autobenches' },
};
/** The elements of the TOML array `value` (`[a, { b = 1 }, "c"]`), each as its text, split at the array's own commas: strings and nested brackets stay whole, and an empty element (a trailing comma) is skipped. Undefined when `value` is no array. */
function inlineArrayItems(value) {
    const v = value.trim();
    if (!v.startsWith('['))
        return undefined;
    return inlineTableMembers(`{${v.slice(1, v.endsWith(']') ? -1 : undefined)}}`);
}
/** A minimal Cargo.toml reader over logical lines (`tomlLogicalLines`): `[package].name`, `[lib].name` / `.path`, the `path` of each `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` table (or element of that array written inline, `bin = [{ path = … }]`) and the `name` of a test, example or bench target that gives no `path`, the `[package]` flags `autotests`, `autoexamples` and `autobenches`, and the path / package / workspace fields of dependency entries plus `[workspace.dependencies]`. A field is found by its full TOML key path, so every spelling of it reads alike: an inline table (`package = { name = … }`, `kit = { path = … }`), dotted keys such as `name.workspace = true` or `lib.path = …`, the `[dependencies.<name>]` table form, a dotted key that names the table itself (`dependencies.name.path` above the first header, `dependencies.name.path` inside `[workspace]` or `[target.<cfg>]`), and the dependency table written as one inline table (`dependencies = { name = { path = … } }`). A string value is read as TOML reads it, in any of its four forms (`tomlString`). The first declaration of a crate keeps it, whatever form it or a later declaration takes; only the lines of that one declaration fill its spec. Anything it does not recognise is ignored, which can only lose an edge, never invent one. */
export function parseCargoManifest(text) {
    let packageName;
    let libName;
    let libPath;
    // Each element of a `[[bin]]`, `[[test]]`, `[[example]]` or `[[bench]]` array, with the `name` and `path` it gives (`null` for one written but not readable as a string).
    const targets = [];
    const undiscoveredDirs = [];
    // The element of a `[[bin]]`, `[[test]]`, `[[example]]` or `[[bench]]` array of tables the current table header opened.
    let inTarget;
    const dependencies = new Map();
    const workspaceDependencies = new Map();
    // The current table header's key segments ([] above the first header).
    let sectionPath = [];
    // A `key = value` line, the key possibly dotted (`a.b`, `"a".b`, `a . b`), and one segment of such a key or a table header: double-quoted (escapes allowed), single-quoted or bare. The value may hold the newlines of a multi-line string.
    const KEY_VALUE = /^((?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)(?:\s*\.\s*(?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+))*)\s*=\s*([\s\S]*)$/;
    const KEY_SEGMENT = /"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+)/g;
    const keySegments = (key) => [...key.matchAll(KEY_SEGMENT)].map((m) => m[1] ?? m[2] ?? m[3]);
    // The `key = value` members of the inline table `value`, each as its key segments and value text (none when `value` is no inline table).
    const membersOf = (value) => (inlineTableMembers(value) ?? []).flatMap((member) => {
        const kv = KEY_VALUE.exec(member);
        return kv ? [[keySegments(kv[1]), kv[2].trim()]] : [];
    });
    const setField = (spec, field, value) => {
        if (field === 'path')
            spec.path = tomlString(value);
        else if (field === 'package')
            spec.package = tomlString(value);
        else if (field === 'workspace')
            spec.workspace = value === 'true';
    };
    // Crates the current table declared first (by a dotted key or by its `[dependencies.<name>]` header), keyed by map: their later lines in this table fill the same spec, as TOML reads them as one table. A crate an earlier table declared is never filled again.
    let declaredHere = new Set();
    const declare = (entry) => {
        const into = entry.workspace ? workspaceDependencies : dependencies;
        const id = `${entry.workspace ? 'workspace' : 'package'}:${entry.crate}`;
        if (!into.has(entry.crate)) {
            into.set(entry.crate, { workspace: false });
            declaredHere.add(id);
        }
        return declaredHere.has(id) ? into.get(entry.crate) : undefined;
    };
    // One `key = value` at its full key path (the table header's segments, then the key's).
    const assign = (keyPath, value) => {
        const top = keyPath[0];
        if (keyPath.length === 2 && top === 'package' && keyPath[1] === 'name')
            packageName = tomlString(value);
        else if (keyPath.length === 2 && top === 'lib' && keyPath[1] === 'name')
            libName = tomlString(value);
        else if (keyPath.length === 2 && top === 'lib' && keyPath[1] === 'path')
            libPath = tomlString(value);
        else if (keyPath.length === 2 && top === 'package' && Object.values(DISCOVERED_DIRS).some((d) => d.flag === keyPath[1])) {
            const { dir } = Object.values(DISCOVERED_DIRS).find((d) => d.flag === keyPath[1]);
            if (value === 'false' && !undiscoveredDirs.includes(dir))
                undiscoveredDirs.push(dir);
        }
        else if (keyPath.length === 1 && TARGET_TABLES.has(top)) {
            // `bin = [{ name = …, path = … }, …]`: the array of tables written inline, each element read as a `[[bin]]` table.
            for (const item of inlineArrayItems(value) ?? []) {
                const target = { kind: top };
                for (const [key, member] of membersOf(item))
                    if (key[0] === 'name' || key[0] === 'path')
                        target[key[0]] = key.length === 1 ? (tomlString(member) ?? null) : null;
                if (inlineTableMembers(item) !== undefined)
                    targets.push(target);
            }
        }
        else if (keyPath.length === 1 && (top === 'package' || top === 'lib')) {
            // `package = { name = … }`, `lib = { path = … }`: the table its key names, each member read as the dotted key it stands for.
            for (const [key, member] of membersOf(value))
                assign([...keyPath, ...key], member);
        }
        else
            assignDependency(keyPath, value);
    };
    const assignDependency = (keyPath, value) => {
        const entry = dependencyEntryAt(keyPath);
        if (entry === undefined) {
            // An inline table above the crates (`dependencies = { kit = { path = "../kit" } }`, `workspace = { dependencies = { … } }`) is the table its key names: each member reads as the dotted key it stands for.
            if (holdsDependencyEntries(keyPath))
                for (const [key, member] of membersOf(value))
                    assignDependency([...keyPath, ...key], member);
            return;
        }
        if (entry.field.length === 0) {
            // `crate = value`: an inline table gives the fields, a version string only declares the crate; the first declaration keeps it. An inline table is whole, so no later line extends it.
            const into = entry.workspace ? workspaceDependencies : dependencies;
            if (into.has(entry.crate))
                return;
            const spec = { workspace: false };
            into.set(entry.crate, spec);
            for (const [key, member] of membersOf(value))
                if (key.length === 1)
                    setField(spec, key[0], member);
            return;
        }
        // `crate.field = value`, or `field = value` under `[dependencies.<crate>]`: the same entry as `crate = { field = value }`. A field other than path, package or workspace (version, features, git) only declares the crate.
        const spec = declare(entry);
        if (spec !== undefined && entry.field.length === 1)
            setField(spec, entry.field[0], value);
    };
    for (const logicalLine of tomlLogicalLines(text)) {
        const line = logicalLine.trim();
        if (line === '')
            continue;
        const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
        if (header) {
            sectionPath = keySegments(header[1]);
            inTarget = line.startsWith('[[') && sectionPath.length === 1 && TARGET_TABLES.has(sectionPath[0]) ? { kind: sectionPath[0] } : undefined;
            if (inTarget !== undefined)
                targets.push(inTarget);
            declaredHere = new Set();
            // `[dependencies.<name>]` (or a table below it) declares the crate; its lines are the crate's fields.
            const entry = dependencyEntryAt(sectionPath);
            if (entry)
                declare(entry);
            continue;
        }
        const kv = KEY_VALUE.exec(line);
        if (!kv)
            continue;
        // A key is one or more segments joined by dots (TOML dotted keys), each bare or quoted.
        const segments = keySegments(kv[1]);
        const value = kv[2].trim();
        if (inTarget !== undefined && (segments[0] === 'path' || segments[0] === 'name'))
            inTarget[segments[0]] = segments.length === 1 ? (tomlString(value) ?? null) : null;
        else
            assign([...sectionPath, ...segments], value);
    }
    const name = libName ?? packageName;
    return {
        crateName: name === undefined ? undefined : normalizeCrateName(name),
        libPath,
        targetPaths: targets.flatMap((t) => (typeof t.path === 'string' ? [t.path] : [])),
        undiscoveredDirs,
        namedTargets: targets.flatMap((t) => (t.path === undefined && typeof t.name === 'string' && Object.hasOwn(DISCOVERED_DIRS, t.kind) ? [`${DISCOVERED_DIRS[t.kind].dir}/${t.name}`] : [])),
        dependencies,
        workspaceDependencies,
    };
}
/** Rust source with `//` line comments and `/* … *\/` block comments blanked (string
 *  contents are not special-cased: a stray match can only fail to find a name, or find one
 *  a comment-like string mentions — both keep the lookup conservative enough for a root
 *  file's own declarations). */
function stripRustComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}
/** Does Rust source `text` declare an item called `name` (struct / enum / union / trait / type / fn / const / static / mod / macro_rules!), bind it with `extern crate` (the alias of `extern crate x as name;`, else the crate of `extern crate name;`), or bring it into scope with a `use`? */
export function rustFileDeclares(text, name) {
    const id = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const decl = new RegExp(`\\b(?:struct|enum|union|trait|type|fn|const|static|mod)\\s+(?:r#)?${id}\\b|\\bmacro_rules!\\s*(?:r#)?${id}\\b|\\bextern\\s+crate\\s+(?:(?:r#)?\\w+\\s+as\\s+)?(?:r#)?${id}\\s*;`);
    if (decl.test(text))
        return true;
    const word = new RegExp(`(?:^|[^A-Za-z0-9_#])(?:r#)?${id}(?![A-Za-z0-9_])`);
    for (const m of text.matchAll(/\buse\s+[^;]*;/g)) {
        if (word.test(m[0]))
            return true;
    }
    return false;
}
/** Manifests that mark a Python project root (PEP 621 / setuptools / uv / Poetry / hatch). */
const PYTHON_PROJECT_MANIFESTS = ['pyproject.toml', 'setup.cfg', 'setup.py'];
/** Directories never searched for Python project manifests: VCS and tool state, dependency
 *  trees and caches. A directory holding `pyvenv.cfg` (a virtual environment) is skipped too. */
const PYTHON_ROOT_SCAN_SKIP = new Set(['node_modules', '__pycache__', 'site-packages', 'dist-packages']);
/**
 * The Python source roots discovered repo-wide from project manifests, computed lazily ONCE
 * per factory instance (on the first absolute Python import) and cached. Every directory
 * holding a `pyproject.toml`, `setup.cfg` or `setup.py` is a project; its source root is
 * its `src/` child when that directory exists (the src layout), else the directory itself
 * (the flat layout). A uv workspace's members, a Poetry monorepo's packages and a
 * src-layout project's tests are all covered by this one rule, because each member is a
 * project with its own manifest. A manifest that is excluded by the caller contributes no
 * root. Hidden directories, dependency trees, caches and virtual environments are skipped.
 *
 * NOTE: makeResolvePathToFile's deps are pure filesystem access; listing directories and
 * checking for manifests is fine there, it parses nothing.
 */
function makePythonProjectRoots(projectRoot, isExcluded) {
    let roots;
    const isDir = (repoRel) => {
        try {
            return statSync(path.join(projectRoot, repoRel)).isDirectory();
        }
        catch {
            return false;
        }
    };
    return () => {
        if (roots !== undefined)
            return roots;
        const found = [];
        const stack = [''];
        while (stack.length > 0) {
            const dir = stack.pop();
            let entries;
            try {
                entries = readdirSync(path.join(projectRoot, dir), { withFileTypes: true });
            }
            catch {
                continue;
            }
            if (entries.some((e) => e.isFile() && e.name === 'pyvenv.cfg'))
                continue; // a virtual environment
            const rel = (name) => (dir === '' ? name : `${dir}/${name}`);
            const isProject = entries.some((e) => e.isFile() && PYTHON_PROJECT_MANIFESTS.includes(e.name) && !(isExcluded?.(rel(e.name)) ?? false));
            if (isProject) {
                const src = rel('src');
                found.push(isDir(src) ? src : dir);
            }
            for (const e of entries) {
                if (!e.isDirectory() || e.name.startsWith('.') || PYTHON_ROOT_SCAN_SKIP.has(e.name))
                    continue;
                stack.push(rel(e.name));
            }
        }
        roots = [...new Set(found)].sort();
        return roots;
    };
}
/**
 * Build the disk-backed Go resolution capabilities for a project root. The module
 * path (the `module <path>` line of go.mod) is read from the nearest go.mod ancestor
 * of the importing file and CACHED per go.mod directory — go.mod is stable across a
 * single factory instance, so each module root is read at most once. Listing the
 * package directory (readdirSync) is the only per-import disk touch.
 *
 * NOTE: makeResolvePathToFile's deps are pure filesystem access;
 * reading go.mod + readdirSync is fine there — it lists/reads files, it does not parse.
 */
function makeGoResolveDeps(projectRoot, ownerOf, isExcluded, exactCase = () => true) {
    // Cache: go.mod directory (repo-rel POSIX, '' = root) → module path or undefined.
    const moduleByDir = new Map();
    /** Read the `module <path>` declaration from a go.mod at the given repo-rel dir, or undefined. */
    function readModulePath(repoRelDir) {
        const abs = path.join(projectRoot, repoRelDir, 'go.mod');
        let text;
        try {
            text = readFileSync(abs, 'utf-8');
        }
        catch {
            return undefined;
        }
        return parseGoModulePath(text);
    }
    /** Find the nearest ancestor directory of `fromFile` that contains a go.mod, then
     *  return its module path AND that directory. The directory (repo-rel POSIX, '' =
     *  root) is the go.mod-bearing module root — required so a NESTED submodule's
     *  packages root under the submodule dir, not the repo root. `moduleByDir` is keyed
     *  by the go.mod directory and stores the module path declared by the go.mod IN
     *  that exact dir, so the `dir` at the point of return IS that module's directory.
     *  Walks up to (and including) the project root. */
    function modulePathFor(fromFile) {
        let dir = path.posix.dirname(toPosix(fromFile));
        if (dir === '.')
            dir = '';
        for (;;) {
            if (moduleByDir.has(dir)) {
                const cached = moduleByDir.get(dir);
                if (cached !== undefined)
                    return { modulePath: cached, moduleDir: dir };
            }
            else {
                const mod = existsSync(path.join(projectRoot, dir, 'go.mod'))
                    ? readModulePath(dir)
                    : undefined;
                moduleByDir.set(dir, mod);
                if (mod !== undefined)
                    return { modulePath: mod, moduleDir: dir };
            }
            if (dir === '')
                return undefined; // reached the root without a usable go.mod
            const parent = path.posix.dirname(dir);
            dir = parent === '.' ? '' : parent;
        }
    }
    /** The module path of a go.mod directly in `dir`, or undefined (cached with the walk). */
    function moduleAt(dir) {
        if (!moduleByDir.has(dir)) {
            moduleByDir.set(dir, existsSync(path.join(projectRoot, dir, 'go.mod')) ? readModulePath(dir) : undefined);
        }
        return moduleByDir.get(dir);
    }
    // Cache: directory → the `use` member directories of the nearest go.work at or above it.
    const workMembersByDir = new Map();
    /** Member module directories (repo-rel POSIX) of the nearest go.work at or above `dir`. */
    function workMembersFrom(dir) {
        const cached = workMembersByDir.get(dir);
        if (cached !== undefined)
            return cached;
        let members = [];
        const abs = path.join(projectRoot, dir, 'go.work');
        if (existsSync(abs)) {
            let text;
            try {
                text = readFileSync(abs, 'utf-8');
            }
            catch {
                text = '';
            }
            for (const use of parseGoWorkUses(text)) {
                const joined = path.posix.normalize(dir === '' ? use : path.posix.join(dir, use));
                if (joined === '..' || joined.startsWith('../') || path.posix.isAbsolute(joined))
                    continue;
                members.push(joined === '.' ? '' : joined);
            }
        }
        else if (dir !== '') {
            const parent = path.posix.dirname(dir);
            members = workMembersFrom(parent === '.' ? '' : parent);
        }
        workMembersByDir.set(dir, members);
        return members;
    }
    /** Every in-repo module reachable from `fromFile`: each go.mod from the file's directory
     *  up to the root (nearest first), plus the members of the nearest go.work. */
    function modulesFor(fromFile) {
        const out = [];
        let dir = path.posix.dirname(toPosix(fromFile));
        if (dir === '.')
            dir = '';
        const start = dir;
        for (;;) {
            const mod = moduleAt(dir);
            if (mod !== undefined)
                out.push({ modulePath: mod, moduleDir: dir });
            if (dir === '')
                break;
            const parent = path.posix.dirname(dir);
            dir = parent === '.' ? '' : parent;
        }
        for (const member of workMembersFrom(start)) {
            const mod = moduleAt(member);
            if (mod !== undefined && !out.some((m) => m.moduleDir === member)) {
                out.push({ modulePath: mod, moduleDir: member });
            }
        }
        return out;
    }
    function dirExists(repoRelDir) {
        const abs = path.resolve(projectRoot, repoRelDir);
        try {
            // The package directory exists only under the name its parent lists (issue 482).
            return statSync(abs).isDirectory() && exactCase(repoRelDir);
        }
        catch {
            return false;
        }
    }
    function goFilesIn(repoRelDir) {
        if (!exactCase(repoRelDir))
            return [];
        const abs = path.resolve(projectRoot, repoRelDir);
        let entries;
        try {
            entries = readdirSync(abs, { withFileTypes: true });
        }
        catch {
            return [];
        }
        const out = [];
        for (const e of entries) {
            if (e.isFile() && e.name.endsWith('.go')) {
                out.push(repoRelDir === '' ? e.name : path.posix.join(repoRelDir, e.name));
            }
        }
        return out;
    }
    return { modulePathFor, modulesFor, moduleAt, dirExists, goFilesIn, ownerOf, isExcluded };
}
/** Strip a go.mod / go.work line comment and surrounding space. */
function goLine(raw) {
    return raw.replace(/\/\/.*$/, '').trim();
}
/** Unquote a go.mod token: `"x"` (interpreted string) or a backtick raw string; a bare
 *  token is returned as is. */
function goUnquote(token) {
    const t = token.trim();
    if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('`') && t.endsWith('`')))) {
        return t.slice(1, -1);
    }
    return t;
}
/** The module path declared by go.mod text: `module x`, `module "x"`, ``module `x` ``, or
 *  the block form `module ( x )`. The first declaration wins; undefined when there is none. */
export function parseGoModulePath(text) {
    let inBlock = false;
    for (const rawLine of text.split('\n')) {
        const line = goLine(rawLine);
        if (line === '')
            continue;
        if (inBlock) {
            if (line === ')') {
                inBlock = false;
                continue;
            }
            const path0 = goUnquote(line);
            return path0 === '' ? undefined : path0;
        }
        const m = /^module(?:\s+|(?=[("`]))(.*)$/.exec(line);
        if (!m)
            continue;
        const rest = m[1].trim();
        if (rest === '(') {
            inBlock = true;
            continue;
        }
        if (rest.startsWith('(') && rest.endsWith(')')) {
            const inner = goUnquote(rest.slice(1, -1));
            return inner === '' ? undefined : inner;
        }
        const value = goUnquote(rest);
        if (value !== '')
            return value;
    }
    return undefined;
}
/** The directories named by `use` directives in go.work text (single-line and block form,
 *  quoted or bare), as written — relative to the go.work directory. */
export function parseGoWorkUses(text) {
    const out = [];
    let inBlock = false;
    for (const rawLine of text.split('\n')) {
        const line = goLine(rawLine);
        if (line === '')
            continue;
        if (inBlock) {
            if (line === ')') {
                inBlock = false;
                continue;
            }
            const dir = goUnquote(line);
            if (dir !== '')
                out.push(dir);
            continue;
        }
        const m = /^use(?:\s+|(?=\())(.*)$/.exec(line);
        if (!m)
            continue;
        const rest = m[1].trim();
        if (rest === '(') {
            inBlock = true;
            continue;
        }
        const dir = goUnquote(rest.startsWith('(') && rest.endsWith(')') ? rest.slice(1, -1) : rest);
        if (dir !== '')
            out.push(dir);
    }
    return out;
}
/**
 * Build the disk-backed Java resolution capabilities for a project root. Java
 * resolution is pure file/directory existence (the package = directory convention),
 * so `exists` is shared with the other resolvers; the only extra capability is
 * listing a package directory's `.java` files for a wildcard import. `isExcluded`
 * flows straight through to `JavaResolveDeps` so both `resolveType` and
 * `resolveJavaPackageFiles` can skip an excluded hit and keep walking the
 * ancestor-source-root chain — see java-resolve.ts's own doc comment.
 *
 * NOTE: makeResolvePathToFile's deps are pure filesystem access;
 * readdirSync is fine there — it lists files, it does not parse.
 */
function makeJavaResolveDeps(projectRoot, exists, isExcluded, exactCase = () => true) {
    function javaFilesIn(repoRelDir) {
        // A package directory listed under another spelling is not the package (issue 482).
        if (!exactCase(repoRelDir))
            return [];
        const abs = path.resolve(projectRoot, repoRelDir);
        let entries;
        try {
            entries = readdirSync(abs, { withFileTypes: true });
        }
        catch {
            return [];
        }
        const out = [];
        for (const e of entries) {
            if (e.isFile() && e.name.endsWith('.java')) {
                out.push(repoRelDir === '' ? e.name : path.posix.join(repoRelDir, e.name));
            }
        }
        return out;
    }
    return { exists, javaFilesIn, isExcluded };
}
/**
 * Build the disk-backed PHP resolution capabilities for a project root. PHP maps a
 * class FQN to a file through composer autoloading (PSR-4, including the `""` fallback
 * prefix, and PSR-0), so the extra capabilities beyond `exists` are the maps in effect for
 * an importing file — those of the NEAREST ancestor composer.json with a PSR-4 or PSR-0
 * map, parsed once per composer.json directory and CACHED — and, as a fallback when those
 * resolve nothing, the maps of every composer.json in the repository (`allMaps`, from the
 * shared repo layout scan; a monorepo's cross-package class lives in another package's map).
 *
 * No composer.json found (or an unreadable / classmap-only one) yields empty maps,
 * which the resolver treats as silence — it never guesses a source root.
 *
 * NOTE: makeResolvePathToFile's deps are pure filesystem access;
 * reading composer.json there is fine — it reads a file, it does not parse source.
 */
function makePhpResolveDeps(projectRoot, exists, isExcluded, allMaps) {
    // Cache: composer.json directory (repo-rel POSIX, '' = root) → parsed autoload maps.
    const byDir = new Map();
    const EMPTY = { psr4: new Map(), psr0: new Map() };
    /** Parse the autoload maps from a composer.json at the given repo-rel dir, or empty. */
    function readAutoload(repoRelDir) {
        const abs = path.join(projectRoot, repoRelDir, 'composer.json');
        let text;
        try {
            text = readFileSync(abs, 'utf-8');
        }
        catch {
            return EMPTY;
        }
        return parseComposerAutoload(text, repoRelDir);
    }
    const usable = (a) => a !== undefined && (a.psr4.size > 0 || a.psr0.size > 0);
    /** Find the nearest ancestor directory of `fromFile` whose composer.json has a PSR-4 or
     *  PSR-0 map. Walks up to (and including) the project root. The FIRST such composer.json
     *  is the nearest map; the resolver falls back to every map in the repository only when
     *  this one resolves nothing. */
    function nearest(fromFile) {
        let dir = path.posix.dirname(toPosix(fromFile));
        if (dir === '.')
            dir = '';
        for (;;) {
            if (byDir.has(dir)) {
                const cached = byDir.get(dir);
                if (usable(cached))
                    return cached;
            }
            else if (existsSync(path.join(projectRoot, dir, 'composer.json'))) {
                const maps = readAutoload(dir);
                byDir.set(dir, maps);
                if (usable(maps))
                    return maps;
            }
            else {
                byDir.set(dir, undefined);
            }
            if (dir === '')
                return EMPTY; // reached the root without a usable composer.json
            const parent = path.posix.dirname(dir);
            dir = parent === '.' ? '' : parent;
        }
    }
    return {
        psr4For: (fromFile) => nearest(fromFile).psr4,
        psr0For: (fromFile) => nearest(fromFile).psr0,
        allMaps,
        exists,
        isExcluded,
    };
}
function toPosix(p) {
    return p.replace(/\\/g, '/');
}
