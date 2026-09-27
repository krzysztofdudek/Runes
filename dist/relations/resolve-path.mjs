import path from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolveTsPath, makeTsResolveDeps } from './extractors/typescript-resolve.mjs';
import { resolvePythonModule } from './extractors/python-resolve.mjs';
import { resolveGoImport } from './extractors/go-resolve.mjs';
import { resolveJavaFqn, resolveJavaPackageFiles } from './extractors/java-resolve.mjs';
import { resolvePhpFqn, parseComposerAutoload } from './extractors/php-resolve.mjs';
import { resolveRustPath } from './extractors/rust-resolve.mjs';
import { resolveIncludePath } from './extractors/include-resolve.mjs';
import { resolveRubyRequireRelative } from './extractors/ruby-resolve.mjs';
import { makeRepoLayout } from './repo-layout.mjs';
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
    const exists = (repoRelPosix) => existsSync(path.resolve(projectRoot, repoRelPosix));
    const goDeps = makeGoResolveDeps(projectRoot, ownerOf, isExcluded);
    const javaDeps = makeJavaResolveDeps(projectRoot, exists, isExcluded);
    const layout = makeRepoLayout(projectRoot, isExcluded);
    const phpDeps = makePhpResolveDeps(projectRoot, exists, isExcluded, layout.composerMaps);
    const rustDeps = makeRustResolveDeps(projectRoot, exists);
    const pythonRoots = makePythonProjectRoots(projectRoot, isExcluded);
    // TS/JS: a candidate is a FILE (a directory named like `./x.config` is never a module), and
    // non-relative specifiers read tsconfig `paths`/`baseUrl` and in-repo package.json files.
    const isFile = (repoRelPosix) => {
        try {
            return statSync(path.resolve(projectRoot, repoRelPosix)).isFile();
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
            return resolvePythonModule(specifier, fromFile, exists, isExcluded, pythonRoots);
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
 * `benches/`, `build.rs`) — see `rustTargetFor`. The package's crate name (`[lib].name`,
 * else `[package].name`, hyphens → underscores) addresses its library from any target.
 *
 * In-repo PATH DEPENDENCIES (`[dependencies]`, `[dev-dependencies]`,
 * `[build-dependencies]` and their `[target.*]` forms; inline `{ path = … }`, the
 * `[dependencies.<name>]` table form, and `{ workspace = true }` inherited from the nearest
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
        const target = rustTargetFor(rel, (sub) => exists(at(sub)), manifest?.libPath);
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
 *  crate declares it, so it gets the `tests/` tree with no root file to bind items to. */
export function rustTargetFor(rel, existsInPackage, libPath) {
    const segs = rel.split('/');
    if (segs[0] === 'src' && segs[1] === 'bin' && segs.length >= 3) {
        if (segs.length === 3)
            return { srcDir: 'src/bin', rootFiles: [rel], fileIsRoot: true };
        const dir = `src/bin/${segs[2]}`;
        const main = `${dir}/main.rs`;
        return { srcDir: dir, rootFiles: [main], fileIsRoot: rel === main };
    }
    if ((segs[0] === 'tests' || segs[0] === 'examples' || segs[0] === 'benches') && segs.length >= 2) {
        if (segs.length === 2)
            return { srcDir: segs[0], rootFiles: [rel], fileIsRoot: true };
        const dir = `${segs[0]}/${segs[1]}`;
        const main = `${dir}/main.rs`;
        if (existsInPackage(main))
            return { srcDir: dir, rootFiles: [main], fileIsRoot: rel === main };
        return { srcDir: segs[0], rootFiles: [], fileIsRoot: false };
    }
    if (rel === 'build.rs')
        return { srcDir: '', rootFiles: [rel], fileIsRoot: true };
    const libRoot = path.posix.normalize(libPath ?? 'src/lib.rs');
    const mainRoot = 'src/main.rs';
    if (rel === libRoot || rel === mainRoot)
        return { srcDir: path.posix.dirname(rel), rootFiles: [rel], fileIsRoot: true };
    return { srcDir: 'src', rootFiles: [libRoot, mainRoot], fileIsRoot: false };
}
function normalizeCrateName(name) {
    return name.replace(/-/g, '_');
}
const DEP_TABLE = /^(?:target\..+\.)?(?:dependencies|dev-dependencies|dev_dependencies|build-dependencies|build_dependencies)$/;
const DEP_SUBTABLE = /^(?:target\..+\.)?(?:dependencies|dev-dependencies|dev_dependencies|build-dependencies|build_dependencies)\.(.+)$/;
/** A minimal, line-oriented Cargo.toml reader: `[package].name`, `[lib].name` / `.path`,
 *  and the path / package / workspace fields of dependency entries (inline tables and the
 *  `[dependencies.<name>]` table form) plus `[workspace.dependencies]`. Anything it does
 *  not recognise is ignored, which can only lose an edge, never invent one. */
export function parseCargoManifest(text) {
    let packageName;
    let libName;
    let libPath;
    const dependencies = new Map();
    const workspaceDependencies = new Map();
    let section = '';
    let subtable;
    const unquote = (v) => v.trim().replace(/^["']|["']$/g, '');
    const stringField = (body, field) => {
        const m = new RegExp(`(?:^|[\\s,{])${field}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(body);
        return m ? (m[1] ?? m[2]) : undefined;
    };
    const specOf = (body) => ({
        path: stringField(body, 'path'),
        package: stringField(body, 'package'),
        workspace: /(?:^|[\s,{])workspace\s*=\s*true\b/.test(body),
    });
    for (const rawLine of text.split('\n')) {
        const line = rawLine.replace(/\s+#.*$/, '').trim();
        if (line === '' || line.startsWith('#'))
            continue;
        const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
        if (header) {
            section = header[1].split('.').map((p) => unquote(p)).join('.');
            subtable = undefined;
            const sub = DEP_SUBTABLE.exec(section);
            const wsSub = /^workspace\.dependencies\.(.+)$/.exec(section);
            if (wsSub)
                subtable = { into: workspaceDependencies, key: unquote(wsSub[1]) };
            else if (sub)
                subtable = { into: dependencies, key: unquote(sub[1]) };
            if (subtable && !subtable.into.has(subtable.key))
                subtable.into.set(subtable.key, { workspace: false });
            continue;
        }
        const kv = /^("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
        if (!kv)
            continue;
        const key = unquote(kv[1]);
        const value = kv[2].trim();
        if (subtable) {
            const spec = subtable.into.get(subtable.key);
            if (key === 'path')
                spec.path = unquote(value);
            else if (key === 'package')
                spec.package = unquote(value);
            else if (key === 'workspace')
                spec.workspace = value === 'true';
            continue;
        }
        if (section === 'package' && key === 'name')
            packageName = unquote(value);
        else if (section === 'lib' && key === 'name')
            libName = unquote(value);
        else if (section === 'lib' && key === 'path')
            libPath = unquote(value);
        else if (DEP_TABLE.test(section) || section === 'workspace.dependencies') {
            const into = section === 'workspace.dependencies' ? workspaceDependencies : dependencies;
            if (!into.has(key))
                into.set(key, value.startsWith('{') ? specOf(value) : { workspace: false });
        }
    }
    const name = libName ?? packageName;
    return {
        crateName: name === undefined ? undefined : normalizeCrateName(name),
        libPath,
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
/** Does Rust source `text` declare an item called `name` (struct / enum / union / trait /
 *  type / fn / const / static / mod / macro_rules!) or bring it into scope with a `use`? */
export function rustFileDeclares(text, name) {
    const id = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const decl = new RegExp(`\\b(?:struct|enum|union|trait|type|fn|const|static|mod)\\s+(?:r#)?${id}\\b|\\bmacro_rules!\\s*(?:r#)?${id}\\b`);
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
function makeGoResolveDeps(projectRoot, ownerOf, isExcluded) {
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
            return statSync(abs).isDirectory();
        }
        catch {
            return false;
        }
    }
    function goFilesIn(repoRelDir) {
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
function makeJavaResolveDeps(projectRoot, exists, isExcluded) {
    function javaFilesIn(repoRelDir) {
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
