import path from 'node:path';
/**
 * Resolve a Python module specifier to a repo-relative POSIX source file, or undefined.
 *
 * The specifier is what the extractor emits: either an ABSOLUTE dotted module path
 * (`foo.bar`, no leading dot) or a RELATIVE one (a leading run of dots, then an
 * optional dotted tail — `.`, `..`, `.sib`, `..pkg.mod`).
 *
 * `exists(repoRelPosix)` reports whether a candidate file exists in the resolution
 * universe (disk at --approve time; a fixed known-set in unit tests). PURE except
 * through `exists` and `isExcluded`. Resolution is a pure file-existence search — no
 * directory listing, no ownership lookup. The owner index downstream maps the resolved
 * file to an owner; an unmapped resolved file is simply not a known target. (A pass
 * resolving many imports builds `makePythonResolver` once instead; it gives the same
 * answers and may list the discovered roots only to skip those that cannot match.)
 *
 * `isExcluded`, when supplied, makes an excluded candidate act as though it does not
 * exist, in BOTH resolvers. In the absolute resolver this happens at two levels: per
 * ancestor source root, the priority list (a package, then a same-named module-as-file
 * — CPython's own precedence) no longer stops at the first EXISTING candidate — an
 * excluded one is skipped so a live candidate further down the SAME root's list (a
 * module-as-file surviving its own excluded same-named package) still reaches the
 * per-root match; and across roots, an excluded root's match is dropped from the
 * ambiguity count before deciding whether a dotted module resolved to one file or
 * several — the search probes every ancestor source root and treats 2+ DISTINCT live
 * matches as genuinely ambiguous (ANOTHER root or a same-named shadow really might be
 * the target, so a static tool must not guess which), while a single live match is
 * unambiguous even when a second, now-excluded match also exists. The relative
 * resolver has no cross-root ambiguity to decide — only the same per-root priority
 * list — so it applies the same "skip an excluded hit, try the next candidate" rule
 * to that one list. Either way an excluded file is told by the caller to not exist for this
 * purpose: it can never BE the real target, so its match must not keep a real,
 * surviving candidate silenced merely because it once shared a name or a dotted
 * module with a file the caller no longer considers. This mirrors the Go/Java package
 * resolvers' drop-then-decide rule. Absent → no candidate is ever dropped (today's
 * behavior, unaffected).
 *
 * RESOLUTION MISS → undefined. This fail-to-silence is the single most important
 * false-positive guard: a stdlib/third-party module, a mis-climbed relative import,
 * or any module whose file is not present resolves to nothing and is never flagged.
 */
export function resolvePythonModule(specifier, fromFile, exists, isExcluded, projectRoots) {
    return makePythonResolver(exists, isExcluded, projectRoots)(specifier, fromFile);
}
/**
 * The resolver `resolvePythonModule` describes, built once for the many imports of one
 * resolution pass over a file universe that does not change during it: every call answers
 * exactly what `resolvePythonModule` answers, and the work imports share is done once.
 * `exists` and the regular-package test are memoized per path, the discovered project roots
 * are read once, and the matches under the discovered roots, which depend on the specifier
 * alone, are memoized per specifier.
 *
 * `listDir`, when supplied, lists the names directly inside a directory (undefined when it
 * cannot be listed), and every path `exists` accepts must be spelled with names those listings
 * give. Each directory is then listed at most once, and an import probes only the discovered
 * roots that hold the path of its parent module (`a/b` as a directory or `a/b.py` for `a.b.c`,
 * `a` for `a`): an external library such as `requests` probes none, and `airflow.models.dag`
 * probes the one distribution that holds `airflow/models` although every distribution holds
 * `airflow/`. Without it every discovered root is probed, with the same answers.
 */
export function makePythonResolver(exists, isExcluded, projectRoots, listDir) {
    const known = new Map();
    const has = (repoRelPosix) => {
        let found = known.get(repoRelPosix);
        if (found === undefined) {
            found = exists(repoRelPosix);
            known.set(repoRelPosix, found);
        }
        return found;
    };
    const inPackage = new Map();
    const insidePackage = (dir) => {
        let inside = inPackage.get(dir);
        if (inside === undefined) {
            inside = insideRegularPackage(dir, has);
            inPackage.set(dir, inside);
        }
        return inside;
    };
    let roots;
    const discovered = () => {
        if (roots === undefined) {
            const all = new Set(projectRoots?.() ?? []);
            roots = { all, usable: [...all].filter((root) => !insidePackage(root)) };
        }
        return roots;
    };
    // A directory's entries, `x/` and `x.py` both as `x`, compared in NFC as the exact-case check compares names.
    const listings = new Map();
    const namesIn = (dir) => {
        if (!listings.has(dir)) {
            const names = listDir?.(dir);
            listings.set(dir, names === undefined ? undefined : new Set(names.map((name) => (name.endsWith('.py') ? name.slice(0, -3) : name).normalize('NFC'))));
        }
        return listings.get(dir);
    };
    // The usable discovered roots that may hold the path `segments` (each but the last a directory, the last a directory or a `.py` file); a directory that cannot be listed keeps its root.
    const holding = new Map();
    const holders = (segments) => {
        if (listDir === undefined)
            return discovered().usable;
        const key = segments.join('/');
        let found = holding.get(key);
        if (found === undefined) {
            const within = segments.slice(0, -1);
            const name = segments[segments.length - 1].normalize('NFC');
            found = (within.length === 0 ? discovered().usable : holders(within)).filter((root) => {
                const names = namesIn(within.length === 0 ? root : joinUnder(root, within.join('/')));
                return names === undefined || names.has(name);
            });
            holding.set(key, found);
        }
        return found;
    };
    const below = new Map();
    const underDiscovered = new Map();
    const ctx = {
        exists: has,
        isExcluded: isExcluded ?? (() => false),
        insideRegularPackage: insidePackage,
        belowDiscoveredRoot: (dir) => {
            let isBelow = below.get(dir);
            if (isBelow === undefined) {
                isBelow = properAncestors(dir).some((ancestor) => discovered().all.has(ancestor));
                below.set(dir, isBelow);
            }
            return isBelow;
        },
        matchesUnderDiscoveredRoots: (segments, modulePath, parentPath) => {
            let matches = underDiscovered.get(modulePath);
            if (matches === undefined) {
                matches = emptyMatches();
                // Every candidate (a/b/c/__init__.py, a/b/c.py, a/b/__init__.py, a/b.py) lies on the path a/b; for a one-segment module, on a.
                for (const root of holders(segments.length > 1 ? segments.slice(0, -1) : segments))
                    probeRoot(root, modulePath, parentPath, ctx, matches);
                underDiscovered.set(modulePath, matches);
            }
            return matches;
        },
    };
    return (specifier, fromFile) => specifier.startsWith('.') ? resolveRelative(specifier, fromFile, has, isExcluded) : resolveAbsolute(specifier, fromFile, ctx);
}
function emptyMatches() {
    return { exact: new Set(), parentPackages: new Set(), parentModules: new Set() };
}
/**
 * Top-level standard-library module names (CPython 3.13 `sys.stdlib_module_names` without
 * the private `_x` modules, plus the modules removed in 3.12/3.13 and added in 3.14, so an
 * older or newer interpreter is covered). A DISCOVERED project root (see resolveAbsolute)
 * is on `sys.path` only because its project is installed, and installed projects come after
 * the standard library, so a module there named like one of these can never shadow it.
 */
const PYTHON_STDLIB_TOP_LEVEL = new Set(('abc annotationlib antigravity argparse array ast asynchat asyncio asyncore atexit audioop base64 bdb binascii ' +
    'bisect builtins bz2 cProfile calendar cgi cgitb chunk cmath cmd code codecs codeop collections colorsys ' +
    'compileall compression concurrent configparser contextlib contextvars copy copyreg crypt csv ctypes curses ' +
    'dataclasses datetime dbm decimal difflib dis distutils doctest email encodings ensurepip enum errno ' +
    'faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc genericpath getopt getpass gettext ' +
    'glob graphlib grp gzip hashlib heapq hmac html http idlelib imaplib imghdr imp importlib inspect io ipaddress ' +
    'itertools json keyword lib2to3 linecache locale logging lzma mailbox mailcap marshal math mimetypes mmap ' +
    'modulefinder msilib msvcrt multiprocessing netrc nis nntplib nt ntpath nturl2path numbers opcode operator ' +
    'optparse os ossaudiodev pathlib pdb pickle pickletools pipes pkgutil platform plistlib poplib posix posixpath ' +
    'pprint profile pstats pty pwd py_compile pyclbr pydoc pydoc_data pyexpat queue quopri random re readline ' +
    'reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site smtpd ' +
    'smtplib sndhdr socket socketserver spwd sqlite3 sre_compile sre_constants sre_parse ssl stat statistics ' +
    'string stringprep struct subprocess sunau symtable sys sysconfig syslog tabnanny tarfile telnetlib tempfile ' +
    'termios textwrap this threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty ' +
    'turtle turtledemo types typing unicodedata unittest urllib uu uuid venv warnings wave weakref webbrowser ' +
    'winreg winsound wsgiref xdrlib xml xmlrpc zipapp zipfile zipimport zlib zoneinfo').split(' '));
/**
 * Absolute dotted module `a.b.c`. Without a directory listing we approximate
 * CPython's source-root search: for the importing file's directory and every
 * ancestor directory up to (and including) the repo root, probe the module as a
 * file/package rooted at that directory. For `from a.b import c` the LAST segment
 * may be a symbol rather than a submodule, so also probe the parent module
 * (`a/b.py`, `a/b/__init__.py`) for the longest-match. We probe EVERY ancestor
 * root (the importer's own/intermediate dirs are not genuine roots, so they must
 * not shadow the real source root): a single distinct matching file is returned;
 * 2+ distinct matches are ambiguous and resolve to undefined (silence).
 *
 * The exact module is looked for at every root before the parent fallback counts. When
 * some root holds the module itself (`a/b/c.py` or `a/b/c/__init__.py`), a parent PACKAGE
 * (`a/b/__init__.py`) found at another root does not compete with it: a package can span
 * several roots (a pkgutil-style namespace package that several distributions ship, each
 * with its own `__init__.py` extending `__path__`), so the submodule is reachable through
 * it. A parent MODULE file (`a/b.py`) at another root still competes, because a module
 * holds no submodules and which of the two Python loads depends on the `sys.path` order.
 * The parent packages count only when no root holds the exact module.
 *
 * An ancestor directory INSIDE A REGULAR PACKAGE is never a root: one that holds an
 * `__init__.py`, or whose parent does (a namespace sub-directory of a regular package).
 * `sys.path` only ever holds directories outside packages, so `import logging` in
 * `app/api/routes.py` loads the standard library even when the package `app/` has a
 * `logging.py`, and must not bind to it.
 *
 * A PEP 420 namespace directory (no `__init__.py` in it or its parent) is outside every
 * regular package, yet it is no more on `sys.path` than a package is: what Python puts
 * there is an installed project's source root, the directory of the script it runs, or
 * the current directory for `python -m`. So an ancestor directory lying strictly below a
 * discovered project root is never a root, and for a top-level name the standard library
 * owns (which precedes every installed project on `sys.path`) no ancestor is a root but the
 * repository root. The importing file's own directory is exempt from both rules: it is
 * `sys.path[0]` when the file runs as a script (`python acme/tool.py`). So `import logging`
 * and `import yaml` in `acme/core/service.py` never bind to `acme/logging/` or `acme/yaml/`
 * when `acme/` is a namespace package.
 *
 * `projectRoots`, when supplied, adds the source roots discovered repo-wide from project
 * manifests (a src-layout project's `src/`, each uv/Poetry workspace member's root), so a
 * test outside `src/` or one workspace member importing another resolves although the
 * root is no ancestor of the importing file. A discovered root is on `sys.path` only
 * because its project is installed, after the standard library, so a top-level name the
 * standard library owns is never matched there. Discovered roots join the SAME distinct-
 * match count, so a module found under two roots still stays silent.
 *
 * An excluded match is dropped BEFORE that ambiguity count. It is told by the caller to
 * not exist, so it can never be the genuine target and must not keep a real,
 * surviving match silenced merely because it once shared a dotted module name
 * with a file the caller no longer considers.
 */
function resolveAbsolute(specifier, fromFile, ctx) {
    const segments = specifier.split('.').filter((s) => s.length > 0);
    if (segments.length === 0)
        return undefined;
    const modulePath = segments.join('/'); // a/b/c
    const parentPath = segments.slice(0, -1).join('/'); // a/b (drop last segment)
    // Probe EVERY ancestor source root and collect the DISTINCT files that match.
    // The importing file's own dir and the intermediate dirs are NOT genuine
    // absolute-import roots, so a same-named module sitting in the importer's own
    // package must not shadow the real source root. Resolving the same dotted
    // module to 2+ distinct LIVE files means we cannot tell which root is genuine —
    // silence (undefined) per the zero-false-positive rule. A single distinct live
    // file is an unambiguous resolution and is returned.
    const stdlibName = PYTHON_STDLIB_TOP_LEVEL.has(segments[0]);
    const ownDir = normalizeDir(path.posix.dirname(toPosix(fromFile)));
    const found = emptyMatches();
    for (const dir of ancestorDirs(ownDir)) {
        // An ancestor other than the importer's own directory is a root only when it is not a
        // directory inside a project (strictly below a discovered root) and, for a standard-library
        // name, only when it is the repository root (see the doc comment above).
        const isRoot = dir === ownDir || (!(stdlibName && dir !== '') && !ctx.belowDiscoveredRoot(dir));
        if (isRoot && !ctx.insideRegularPackage(dir))
            probeRoot(dir, modulePath, parentPath, ctx, found);
    }
    if (!stdlibName) {
        // A discovered root that is also an ancestor root adds the same file of the same kind again: the sets keep one.
        const under = ctx.matchesUnderDiscoveredRoots(segments, modulePath, parentPath);
        for (const kind of ['exact', 'parentPackages', 'parentModules'])
            for (const file of under[kind])
                found[kind].add(file);
    }
    const matches = new Set([...(found.exact.size > 0 ? found.exact : found.parentPackages), ...found.parentModules]);
    return matches.size === 1 ? [...matches][0] : undefined;
}
/**
 * Adds one root's strongest live match to `into`, by kind. Per root, the candidate priority
 * order is preserved (module-as-file/package first, then the parentPath longest-match): only
 * the first LIVE hit at the root counts, so a root that matches both the full module and its
 * parent still contributes just one file (the stronger match wins) — but an EXCLUDED hit does
 * not stop the search at that root: it is skipped exactly like a genuine miss, so a live
 * candidate further down the SAME root's list (a package outranking its own excluded
 * same-named module, matching CPython's real precedence) still counts. Across roots, an exact
 * hit outranks a parent package fallback (see resolveAbsolute's doc comment).
 */
function probeRoot(dir, modulePath, parentPath, ctx, into) {
    const firstLive = (candidates) => candidates.find((cand) => ctx.exists(cand) && !ctx.isExcluded(cand));
    // package / module-as-file at this root — CPython imports a regular
    // package over a same-named module file (verified against the real
    // interpreter: `import lib.mod` loads lib/mod/__init__.py even when
    // lib/mod.py also exists at the same root).
    const hit = firstLive([joinUnder(dir, modulePath + '/__init__.py'), joinUnder(dir, modulePath + '.py')]);
    if (hit !== undefined) {
        into.exact.add(hit);
        return;
    }
    // `from a.b import c` longest-match: last segment is a symbol in module a.b.
    if (parentPath.length === 0)
        return;
    const parentPackage = joinUnder(dir, parentPath + '/__init__.py');
    const fallback = firstLive([parentPackage, joinUnder(dir, parentPath + '.py')]);
    if (fallback !== undefined)
        (fallback === parentPackage ? into.parentPackages : into.parentModules).add(fallback);
}
/**
 * Relative module: a leading run of `k` dots then an optional dotted tail. CPython
 * semantics: 1 dot = the importing file's own package (its directory), each extra
 * dot climbs one parent. So climb `(k - 1)` directories from the importing file's
 * directory, append the tail path, then try `<base>/__init__.py` and `<base>.py`
 * (a package before a same-named module-as-file, the same priority order the
 * absolute resolver uses). An excluded candidate is skipped exactly like a genuine miss, so
 * a live package sitting right next to its own excluded same-named module still
 * resolves — there is only one base here, so no cross-root ambiguity to decide.
 */
function resolveRelative(specifier, fromFile, exists, isExcluded) {
    const dotMatch = specifier.match(/^\.+/);
    if (dotMatch === null)
        return undefined;
    const dots = dotMatch[0].length;
    const tail = specifier.slice(dots); // "" | "sib" | "pkg.mod"
    // Start from the importing file's directory; climb (dots - 1) parents.
    let base = path.posix.dirname(toPosix(fromFile));
    for (let i = 0; i < dots - 1; i++) {
        const parent = path.posix.dirname(base);
        if (parent === base)
            return undefined; // climbed above repo root → miss
        base = parent;
    }
    const tailPath = tail.length > 0 ? tail.split('.').filter((s) => s.length > 0).join('/') : '';
    const target = tailPath.length > 0 ? path.posix.join(base, tailPath) : base;
    const normalized = path.posix.normalize(target);
    if (normalized.startsWith('..'))
        return undefined; // escaped the repo → miss
    const candidates = tailPath.length > 0
        ? [path.posix.join(normalized, '__init__.py'), normalized + '.py']
        : [path.posix.join(normalized, '__init__.py')]; // bare dots → the package's __init__
    const isExcl = isExcluded ?? (() => false);
    for (const cand of candidates) {
        if (exists(cand) && !isExcl(cand))
            return cand;
    }
    return undefined;
}
/** True when `dir` is inside a regular package, so it can never be a `sys.path` root: it
 *  holds an `__init__.py` itself, or its parent does (a namespace sub-directory of a regular
 *  package). The repo root has no parent inside the repo. */
function insideRegularPackage(dir, exists) {
    if (exists(joinUnder(dir, '__init__.py')))
        return true;
    if (dir === '')
        return false;
    const parent = path.posix.dirname(dir);
    return exists(joinUnder(parent === '.' ? '' : parent, '__init__.py'));
}
/** Every directory `dir` lies strictly below, nearest-first, ending with '' (the repo root);
 *  none for the repo root itself. */
function properAncestors(dir) {
    return dir === '' ? [] : ancestorDirs(dir).slice(1);
}
/** A repo-relative directory as `path.posix.dirname` gives it, with the repo root as ''. */
function normalizeDir(dir) {
    return dir === '.' ? '' : dir;
}
/** The importing file's directory and every ancestor directory up to the repo root,
 *  nearest-first. '' (the repo root) is the final entry. */
function ancestorDirs(dir) {
    const out = [];
    let cur = dir;
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
