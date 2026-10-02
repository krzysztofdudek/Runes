import path from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
/**
 * Resolve a TS/JS module specifier to a repo-relative POSIX source file, or undefined.
 *
 * `existsAny(repoRelPosix)` reports whether a candidate FILE exists in the resolution universe (disk at check time; a fixed known-set in unit tests). `deps`, when given, answers the project-configuration questions a non-relative specifier needs (tsconfig, package.json); without it only relative specifiers resolve. A file `deps.isExcluded` names acts as though it does not exist, both as a candidate and as a configuration file, so ignored build output or a generated config on disk cannot change the answer. PURE except through `existsAny` and `deps`.
 *
 * Zero false positives outrank recall: every branch below either names the file the
 * TypeScript compiler (or the bundler convention it documents) would pick, or returns
 * undefined. Resolution rules, in order:
 *
 *   0. A `?query` suffix (`./icon.svg?raw`, `./w.js?worker`) is a bundler loader hint,
 *      not part of the path — it is stripped.
 *   1. Relative ('./', '../') → joined onto the importing file's directory.
 *   2. Root-absolute ('/src/x') → the bundler convention (Vite, Next.js public imports):
 *      joined onto the importing file's PACKAGE root (the nearest ancestor holding a
 *      package.json). No package root → undefined. Never joined onto the importer's own
 *      directory, which names a file the import does not mean.
 *   3. Package-internal ('#x') → the nearest package.json `imports` map (exact key, then
 *      the longest `*` pattern); a relative target resolves inside that package, a bare
 *      target resolves as step 4 would.
 *   4. Bare ('@/x', 'src/x', '@acme/b', '@acme/b/sub'):
 *      a. tsconfig `paths` of the nearest tsconfig.json (jsconfig.json for JS and for a Vue or Svelte component), with its `extends` chain; when that config is solution-style (`references`, and its own `files`/`include`/`exclude` do not hold the file), the referenced config that holds it, and silence when several hold it and disagree. The exact key, else the longest-prefix `*` pattern; each substitution is probed like a relative path. Exactly one substitution naming a file → that file. Two or more naming DIFFERENT files → undefined (ambiguous). A matched pattern with no hit falls through to (c), as the compiler does.
 *      b. tsconfig `baseUrl` (only when no `paths` pattern matched): joined onto baseUrl.
 *      c. An in-repo package bound to the specifier's package name: the importer's own package when its nearest package.json has that `name` and `exports` (self-reference); else the one the importer's own package.json (the nearest that names a package, declares dependencies or declares a workspace; a `{"type": ...}` marker is passed over) declares under that name with a local spec (`file:`, `link:`, `portal:` or a `workspace:` path, joined onto that package's directory; a `workspace:<name>@<range>` alias names a member); else, inside a declared workspace (the nearest ancestor whose pnpm-workspace.yaml lists `packages`, or whose package.json has `workspaces`), the workspace member with that `name` (the root and the directories its globs match; a fixture outside them is never linked under its name), and while the declaring directory is itself a member of an enclosing workspace, that one's members too; with no workspace declared above the importer, any in-repo package.json with that `name`. Then `exports` (exact subpath, else longest `*` pattern; the first condition target that names a file), else for the root `types`/`typings`, `module`, `main` and `index.*`, for a subpath the path inside the package. Two candidates with the same name → undefined.
 *      Anything else is an external package or a Node built-in → undefined.
 *   A candidate path is probed as: an explicit JS-family extension (.js/.jsx/.mjs/.cjs)
 *   first tries the TS source it compiles from (NodeNext) then itself; an explicit
 *   TS extension is used as-is; any other explicit extension (.json, .css, .svg, .vue,
 *   .wasm) is probed literally; then each source extension is appended; then, for a
 *   directory holding a package.json, its `types`/`typings`/`module`/`main` entry; then
 *   the directory index (`index.ts|tsx|js|jsx|mjs|cjs`).
 */
export function resolveTsPath(specifier, fromFile, existsAny, deps) {
    const spec = stripQuery(specifier);
    if (spec === '')
        return undefined;
    const from = toPosix(fromFile);
    // A file the caller excludes (git-ignored build output, a generated file) acts as though it does not exist, for every probe below: the answer is the one a clean checkout gives.
    const excluded = deps?.isExcluded;
    const exists = excluded === undefined ? existsAny : (p) => existsAny(p) && !excluded(p);
    if (spec.startsWith('.')) {
        return probe(path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)), exists, deps);
    }
    if (spec.startsWith('/')) {
        const pkg = deps?.nearestPackage(from);
        if (pkg === undefined)
            return undefined;
        return probe(joinUnder(pkg.dir, spec.slice(1)), exists, deps);
    }
    if (deps === undefined)
        return undefined;
    if (spec.startsWith('#')) {
        const pkg = deps.nearestPackage(from);
        if (pkg === undefined)
            return undefined;
        const targets = matchSubpathMap(pkg.manifest.imports, spec);
        if (targets === undefined)
            return undefined;
        for (const target of targets) {
            const hit = target.startsWith('./')
                ? probe(joinUnder(pkg.dir, target), exists, deps)
                : target.startsWith('#') || target.startsWith('/') || target.startsWith('.')
                    ? undefined
                    : resolveBare(target, from, exists, deps);
            if (hit !== undefined)
                return hit;
        }
        return undefined;
    }
    return resolveBare(spec, from, exists, deps);
}
function resolveBare(spec, from, exists, deps) {
    const config = deps.tsconfigFor(from);
    // A tsconfig that exists but cannot be read may remap this very specifier: resolving it
    // any other way could name a file the compiler would not. Stay silent.
    if (config === 'unknown')
        return undefined;
    if (config?.paths !== undefined) {
        const substitutions = matchPattern(config.paths.map, spec);
        if (substitutions !== undefined) {
            const hits = new Set();
            for (const sub of substitutions) {
                const hit = probe(joinConfigPath(config.paths.base, sub), exists, deps);
                if (hit !== undefined)
                    hits.add(hit);
            }
            if (hits.size > 1)
                return undefined; // two targets name different files → ambiguous
            if (hits.size === 1)
                return [...hits][0];
            // A matched pattern with no hit: the compiler moves on to package lookup.
            return resolveWorkspacePackage(spec, from, exists, deps);
        }
    }
    if (config?.baseUrl !== undefined) {
        const hit = probe(joinUnder(config.baseUrl, spec), exists, deps);
        if (hit !== undefined)
            return hit;
    }
    return resolveWorkspacePackage(spec, from, exists, deps);
}
/** `@scope/name/sub/path` → ['@scope/name', './sub/path']; `name` → ['name', '.']. */
function splitPackageSpecifier(spec) {
    const segs = spec.split('/');
    const nameLen = spec.startsWith('@') ? 2 : 1;
    if (segs.length < nameLen || segs.slice(0, nameLen).some((s) => s === ''))
        return undefined;
    const name = segs.slice(0, nameLen).join('/');
    const rest = segs.slice(nameLen).join('/');
    return [name, rest === '' ? '.' : `./${rest}`];
}
function resolveWorkspacePackage(spec, from, exists, deps) {
    const split = splitPackageSpecifier(spec);
    if (split === undefined)
        return undefined;
    const [name, subpath] = split;
    const pkg = deps.packageNamed(name, from);
    if (pkg === undefined || pkg === 'ambiguous')
        return undefined;
    const { manifest, dir } = pkg;
    if (manifest.exports !== undefined && manifest.exports !== null) {
        // `exports` is the package's whole public surface: a subpath it does not list is not
        // importable, so no fallback to the directory layout.
        const targets = matchSubpathMap(normalizeExports(manifest.exports), subpath);
        if (targets === undefined)
            return undefined;
        for (const target of targets) {
            if (!target.startsWith('./'))
                continue;
            const hit = probe(joinUnder(dir, target), exists);
            if (hit !== undefined)
                return hit;
        }
        return undefined;
    }
    if (subpath !== '.')
        return probe(joinUnder(dir, subpath), exists, deps);
    return entryOf(pkg, exists) ?? probe(joinUnder(dir, 'index'), exists);
}
/** `exports` shorthand forms (a string, an array, a conditions object) mean the root subpath. */
function normalizeExports(exportsField) {
    if (typeof exportsField === 'string' || Array.isArray(exportsField))
        return { '.': exportsField };
    if (isRecord(exportsField)) {
        const keys = Object.keys(exportsField);
        if (keys.length > 0 && !keys.some((k) => k.startsWith('.')))
            return { '.': exportsField };
    }
    return exportsField;
}
/**
 * Match `key` against a package.json `exports`/`imports` subpath map: the exact key
 * first, else the `*` pattern with the longest prefix. Returns the ordered string
 * targets (conditions in declaration order, arrays in order, `*` replaced), or
 * undefined when no key matches or the match is explicitly blocked (`null`).
 */
function matchSubpathMap(map, key) {
    if (!isRecord(map))
        return undefined;
    if (Object.hasOwn(map, key))
        return collectTargets(map[key], undefined);
    let best;
    for (const [pattern, value] of Object.entries(map)) {
        const star = pattern.indexOf('*');
        if (star === -1 || pattern.indexOf('*', star + 1) !== -1)
            continue;
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (!key.startsWith(prefix) || !key.endsWith(suffix) || key.length < prefix.length + suffix.length)
            continue;
        if (best === undefined || prefix.length > best.prefix.length)
            best = { prefix, suffix, value };
    }
    if (best === undefined)
        return undefined;
    const captured = key.slice(best.prefix.length, key.length - best.suffix.length);
    return collectTargets(best.value, captured);
}
function collectTargets(value, captured) {
    if (value === null)
        return undefined;
    const out = [];
    const visit = (v) => {
        if (typeof v === 'string')
            out.push(captured === undefined ? v : v.split('*').join(captured));
        else if (Array.isArray(v))
            v.forEach(visit);
        else if (isRecord(v))
            Object.values(v).forEach(visit);
    };
    visit(value);
    return out;
}
/** tsconfig `paths` lookup: the exact key, else the `*` pattern with the longest prefix. */
function matchPattern(map, spec) {
    if (Object.hasOwn(map, spec) && !spec.includes('*'))
        return map[spec];
    let best;
    for (const [pattern, subs] of Object.entries(map)) {
        const star = pattern.indexOf('*');
        if (star === -1)
            continue;
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (!spec.startsWith(prefix) || !spec.endsWith(suffix) || spec.length < prefix.length + suffix.length)
            continue;
        if (best === undefined || prefix.length > best.prefix.length)
            best = { prefix, suffix, subs };
    }
    if (best === undefined)
        return undefined;
    const captured = spec.slice(best.prefix.length, spec.length - best.suffix.length);
    return best.subs.map((s) => s.split('*').join(captured));
}
/**
 * Probe a normalised repo-rel path: the literal/rewrite candidates, then — for a directory
 * that is itself a package (a package.json beside its files, `deps` given) — that
 * package.json's `types`/`typings`/`module`/`main` entry, then the directory index.
 */
function probe(joined, exists, deps) {
    if (joined === undefined)
        return undefined;
    for (const cand of fileCandidates(joined)) {
        if (exists(cand))
            return cand;
    }
    const insideRepo = joined !== '..' && !joined.startsWith('../') && !path.posix.isAbsolute(joined);
    const dirPkg = insideRepo ? deps?.packageAt?.(joined) : undefined;
    if (dirPkg !== undefined) {
        const hit = entryOf(dirPkg, exists);
        if (hit !== undefined)
            return hit;
    }
    for (const cand of indexCandidates(joined)) {
        if (exists(cand))
            return cand;
    }
    return undefined;
}
/** A package directory's own entry file from its `types`/`typings`/`module`/`main` fields. */
function entryOf(pkg, exists) {
    const { manifest, dir } = pkg;
    for (const field of [manifest.types, manifest.typings, manifest.module, manifest.main]) {
        if (typeof field !== 'string' || field === '')
            continue;
        const target = joinUnder(dir, field);
        if (target === undefined || target === dir)
            continue;
        const hit = probe(target, exists);
        if (hit !== undefined)
            return hit;
    }
    return undefined;
}
// A declaration file (`.d.ts`, `.d.mts`, `.d.cts`) is probed right after the sources, the
// way the compiler probes it: a type-only import of `./types` commonly names one.
const JS_REWRITES = {
    '.js': ['.ts', '.tsx', '.d.ts', '.js', '.jsx'],
    '.jsx': ['.tsx', '.jsx'],
    '.mjs': ['.mts', '.d.mts', '.mjs'],
    '.cjs': ['.cts', '.d.cts', '.cjs'],
};
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const APPENDED_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs'];
const INDEX_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs'];
/**
 * The direct-file candidates for a normalised joined path. They always precede the
 * directory candidates so that a file named `util.ts` beats a directory `util/index.ts`.
 */
function fileCandidates(joined) {
    const out = [];
    const ext = path.posix.extname(joined);
    if (ext in JS_REWRITES) {
        // Known JS-family extension: try each TS/JS source rewrite before index fallback.
        const stem = joined.slice(0, -ext.length);
        for (const e of JS_REWRITES[ext])
            out.push(stem + e);
    }
    else if (TS_EXTENSIONS.has(ext)) {
        // Already a TS source extension — use as-is.
        out.push(joined);
    }
    else {
        // Any other explicit extension (.json, .css, .svg, .vue, .wasm, or a dotted stem such
        // as `./app.config`) is probed literally first, then each source extension appended.
        if (ext !== '')
            out.push(joined);
        for (const e of APPENDED_EXTENSIONS)
            out.push(joined + e);
    }
    return out;
}
/** Directory index candidates — probed after the direct-file candidates. */
function indexCandidates(joined) {
    return INDEX_EXTENSIONS.map((e) => path.posix.join(joined, 'index' + e));
}
/** Join a repo-rel base dir and a relative path; undefined when the result escapes the repo. */
function joinUnder(baseDir, rel) {
    const joined = path.posix.normalize(path.posix.join(baseDir === '' ? '.' : baseDir, rel));
    if (joined === '..' || joined.startsWith('../') || path.posix.isAbsolute(joined))
        return undefined;
    return joined === '.' ? '' : joined;
}
/** Join a tsconfig path value onto its base directory. A leading '/' marks a value already
 *  anchored at the repository root (a rewritten `${configDir}`). */
function joinConfigPath(baseDir, value) {
    return value.startsWith('/') ? joinUnder('', value.slice(1)) : joinUnder(baseDir, value);
}
function stripQuery(specifier) {
    const q = specifier.indexOf('?');
    return q === -1 ? specifier : specifier.slice(0, q);
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function toPosix(p) {
    return p.replace(/\\/g, '/');
}
// ─── Disk-backed configuration ───────────────────────────────────────────────
/**
 * Parse JSON with comments and trailing commas (the tsconfig dialect). A leading UTF-8 byte order mark (Visual Studio saves one) is skipped, as tsc, Node and npm skip it. Returns undefined for anything that is still not JSON afterwards.
 */
export function parseJsonc(text) {
    let out = '';
    let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const n = text.length;
    while (i < n) {
        const c = text[i];
        if (c === '"') {
            let j = i + 1;
            while (j < n && text[j] !== '"')
                j += text[j] === '\\' ? 2 : 1;
            out += text.slice(i, j + 1);
            i = j + 1;
        }
        else if (c === '/' && text[i + 1] === '/') {
            while (i < n && text[i] !== '\n')
                i++;
        }
        else if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end === -1 ? n : end + 2;
        }
        else {
            out += c;
            i++;
        }
    }
    // Trailing commas: a comma followed only by whitespace before a closing bracket. The
    // comment pass above already removed every comment, and a string never contains a raw
    // newline-free `,}` that this could corrupt except inside quotes — re-scan quote-aware.
    let cleaned = '';
    for (let k = 0; k < out.length; k++) {
        const c = out[k];
        if (c === '"') {
            let j = k + 1;
            while (j < out.length && out[j] !== '"')
                j += out[j] === '\\' ? 2 : 1;
            cleaned += out.slice(k, j + 1);
            k = j;
            continue;
        }
        if (c === ',') {
            let j = k + 1;
            while (j < out.length && /\s/.test(out[j]))
                j++;
            if (out[j] === '}' || out[j] === ']')
                continue;
        }
        cleaned += c;
    }
    try {
        return JSON.parse(cleaned);
    }
    catch {
        return undefined;
    }
}
const SKIPPED_DIRS = new Set(['node_modules', 'bower_components', 'jspm_packages']);
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
/**
 * Whether a path matches one glob of the dialect npm, yarn and pnpm workspaces and tsconfig `exclude` share: `*` and `?` within one segment, `**` for any number of segments, everything else literal. Both sides are relative to the same directory.
 */
function globMatches(glob, rel) {
    const pattern = glob.split('/').filter((seg) => seg !== '' && seg !== '.');
    const segs = rel === '' ? [] : rel.split('/');
    const segment = (pat, seg) => {
        let source = '';
        for (const c of pat)
            source += c === '*' ? '[^/]*' : c === '?' ? '[^/]' : escapeRegex(c);
        return new RegExp(`^${source}$`).test(seg);
    };
    const match = (i, j) => {
        if (i === pattern.length)
            return j === segs.length;
        if (pattern[i] === '**')
            return match(i + 1, j) || (j < segs.length && match(i, j + 1));
        return j < segs.length && segment(pattern[i], segs[j]) && match(i + 1, j + 1);
    };
    return match(0, 0);
}
function escapeRegex(c) {
    return c.replace(/[\\^$.|+()[\]{}]/g, '\\$&');
}
/**
 * Whether a repo-rel file matches a tsconfig `include` pattern (repo-rel too) the way tsc's file matcher reads it: a last segment with no `.`, `*` or `?` names a directory and matches everything under it; a pattern ending in `**` matches nothing (tsc rejects it); `*` and `?` stay within a segment and `**` spans any number of segments, but a wildcard that opens a segment, and every segment `**` spans, never matches a name starting with `.`, no wildcard matches a `node_modules`, `bower_components` or `jspm_packages` segment, and a `*` in the file name never spans the dot that opens a trailing `.min.js`. A segment written out matches itself, dotted or not.
 */
function includeMatches(pattern, file) {
    const pat = pattern.split('/').filter((seg) => seg !== '');
    const last = pat.length === 0 ? '' : pat[pat.length - 1];
    if (last === '**')
        return false;
    if (!/[.*?]/.test(last))
        pat.push('**', '*');
    const segs = file.split('/');
    const segment = (p, seg, isName) => {
        if (!/[*?]/.test(p))
            return p === seg;
        if (SKIPPED_DIRS.has(seg))
            return false;
        const star = isName ? '(?:[^./]|\\.(?!min\\.js$))*' : '[^/]*';
        let source = '';
        let rest = p;
        if (rest.startsWith('*')) {
            source = `(?:[^./]${star})?`;
            rest = rest.slice(1);
        }
        else if (rest.startsWith('?')) {
            source = '[^./]';
            rest = rest.slice(1);
        }
        for (const c of rest)
            source += c === '*' ? star : c === '?' ? '[^/]' : escapeRegex(c);
        return new RegExp(`^${source}$`).test(seg);
    };
    const spanned = (seg) => !seg.startsWith('.') && !SKIPPED_DIRS.has(seg);
    const match = (i, j) => {
        if (i === pat.length)
            return j === segs.length;
        if (pat[i] === '**')
            return match(i + 1, j) || (j < segs.length && spanned(segs[j]) && match(i, j + 1));
        return j < segs.length && segment(pat[i], segs[j], j === segs.length - 1) && match(i + 1, j + 1);
    };
    return match(0, 0);
}
/** Whether an `include` or `exclude` spec climbs out with `..` after a `**`, which tsc rejects (so it matches nothing). */
function dotDotAfterRecursion(spec) {
    const at = spec.startsWith('**/') ? 0 : spec.indexOf('/**/');
    if (at === -1)
        return false;
    const dots = spec.endsWith('/..') ? spec.length : spec.lastIndexOf('/../');
    return dots > at;
}
/** The globs a workspace glob's brace alternatives stand for (`packages/{core,ui}`, nested ones too), as npm's minimatch and pnpm's globber expand them; a brace with no comma or no closing partner is literal. tsconfig `include` and `exclude` have no braces, so only workspace globs go through this. */
function expandBraces(glob) {
    const open = glob.indexOf('{');
    if (open === -1)
        return [glob];
    let depth = 0;
    const commas = [];
    for (let k = open; k < glob.length; k++) {
        if (glob[k] === ',' && depth === 1)
            commas.push(k);
        else if (glob[k] === '{')
            depth++;
        else if (glob[k] === '}' && --depth === 0) {
            if (commas.length === 0)
                return expandBraces(glob.slice(k + 1)).map((rest) => glob.slice(0, k + 1) + rest);
            const bounds = [open, ...commas, k];
            return bounds.slice(1).flatMap((end, i) => expandBraces(glob.slice(0, open) + glob.slice(bounds[i] + 1, end) + glob.slice(k + 1)));
        }
    }
    return [glob];
}
/** The `packages` globs of a pnpm-workspace.yaml: a block list (`- 'apps/*'`) or a flow list (`['apps/*']`) under a top-level `packages:` key. undefined when the file has no such key (a file holding only settings such as catalogs); pnpm then takes the root alone, and the resolver counts every package under the file's directory, as it does where no workspace is declared. */
function pnpmWorkspacePackages(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const unquote = (raw) => {
        const quoted = /^\s*(['"])(.*?)\1/.exec(raw);
        return quoted !== null ? quoted[2] : raw.replace(/(^|\s)#.*$/, '').trim();
    };
    const at = lines.findIndex((line) => /^packages\s*:/.test(line));
    if (at === -1)
        return undefined;
    let inline = lines[at].replace(/^packages\s*:/, '').trim();
    if (inline.startsWith('[')) {
        for (let k = at + 1; !inline.includes(']') && k < lines.length; k++)
            inline += ` ${lines[k]}`;
        return inline.slice(1).split(']')[0].split(',').map(unquote).filter((g) => g !== '');
    }
    const globs = [];
    for (const line of lines.slice(at + 1)) {
        if (/^\s*(#.*)?$/.test(line))
            continue;
        const item = /^\s*-\s+(.*)$/.exec(line);
        if (item === null)
            break;
        const glob = unquote(item[1]);
        if (glob !== '')
            globs.push(glob);
    }
    return globs;
}
/**
 * Build the disk-backed {@link TsResolveDeps} for a project root. Each tsconfig, package.json and directory lookup is cached for the life of the returned object, which one relation pass owns. The in-repo package index is built on the first bare specifier that reaches package lookup: one walk of the repository that skips `node_modules` (where a workspace package's own symlink lives), dot-directories and any path `isExcluded` names. An excluded tsconfig, jsconfig or package.json is never read: it acts as though it does not exist.
 */
export function makeTsResolveDeps(projectRoot, isExcluded) {
    const jsonCache = new Map();
    const readJson = (repoRel) => {
        if (jsonCache.has(repoRel))
            return jsonCache.get(repoRel);
        let parsed;
        try {
            parsed = parseJsonc(readFileSync(path.join(projectRoot, repoRel), 'utf-8'));
        }
        catch {
            parsed = undefined;
        }
        jsonCache.set(repoRel, parsed);
        return parsed;
    };
    const isFile = (repoRel) => {
        try {
            return statSync(path.join(projectRoot, repoRel)).isFile() && !isExcluded?.(repoRel);
        }
        catch {
            return false;
        }
    };
    const dirOf = (repoRelFile) => {
        const d = path.posix.dirname(repoRelFile);
        return d === '.' ? '' : d;
    };
    const ancestors = (fromFile) => {
        const out = [];
        let dir = dirOf(fromFile);
        for (;;) {
            out.push(dir);
            if (dir === '')
                return out;
            dir = dirOf(dir);
        }
    };
    const packageInDir = new Map();
    const packageAt = (dir) => {
        if (packageInDir.has(dir))
            return packageInDir.get(dir);
        const file = dir === '' ? 'package.json' : `${dir}/package.json`;
        const manifest = isFile(file) ? readJson(file) : undefined;
        const pkg = isRecord(manifest) ? { dir, manifest: manifest } : undefined;
        packageInDir.set(dir, pkg);
        return pkg;
    };
    // Every in-repo package, from one walk of the repository.
    let inRepo;
    const inRepoPackages = () => {
        if (inRepo !== undefined)
            return inRepo;
        inRepo = [];
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
            for (const e of entries) {
                const rel = dir === '' ? e.name : `${dir}/${e.name}`;
                if (e.isDirectory()) {
                    if (e.name.startsWith('.') || SKIPPED_DIRS.has(e.name))
                        continue;
                    if (isExcluded?.(rel))
                        continue;
                    stack.push(rel);
                }
                else if (e.isFile() && e.name === 'package.json') {
                    const pkg = packageAt(dir); // undefined for an excluded or unparseable package.json
                    if (pkg !== undefined)
                        inRepo.push(pkg);
                }
            }
        }
        return inRepo;
    };
    const indexByName = (pkgs) => {
        const byName = new Map();
        for (const pkg of pkgs) {
            const name = pkg.manifest.name;
            if (typeof name !== 'string' || name === '')
                continue;
            byName.set(name, byName.has(name) ? 'ambiguous' : pkg);
        }
        return byName;
    };
    let everyPackage;
    const packageIndex = () => (everyPackage ??= indexByName(inRepoPackages()));
    // The workspace a directory declares: the `packages` of its pnpm-workspace.yaml (with none listed, every package under it counts, as where nothing is declared), else its package.json `workspaces` (an array, or yarn's `{ packages }`). undefined when it declares none.
    const declaredAt = new Map();
    const workspaceGlobs = (dir) => {
        if (declaredAt.has(dir))
            return declaredAt.get(dir);
        let globs;
        const pnpm = dir === '' ? 'pnpm-workspace.yaml' : `${dir}/pnpm-workspace.yaml`;
        if (isFile(pnpm)) {
            let text = '';
            try {
                text = readFileSync(path.join(projectRoot, pnpm), 'utf-8');
            }
            catch {
                // unreadable: read as a file with no packages list
            }
            globs = pnpmWorkspacePackages(text) ?? ['**'];
        }
        else {
            const field = packageAt(dir)?.manifest.workspaces;
            const list = isRecord(field) ? field.packages : field;
            if (Array.isArray(list))
                globs = list.filter((g) => typeof g === 'string');
        }
        declaredAt.set(dir, globs);
        return globs;
    };
    // Whether a directory is a member of the workspace rooted at `root`: the root itself, or a directory a positive glob matches and no `!` glob does, braces expanded.
    const isMemberDir = (root, globs, dir) => {
        if (dir === root)
            return true;
        if (root !== '' && !dir.startsWith(`${root}/`))
            return false;
        const rel = root === '' ? dir : dir.slice(root.length + 1);
        const include = globs.filter((g) => !g.startsWith('!')).flatMap(expandBraces);
        const exclude = globs.filter((g) => g.startsWith('!')).flatMap((g) => expandBraces(g.slice(1)));
        return include.some((g) => globMatches(g, rel)) && !exclude.some((g) => globMatches(g, rel));
    };
    // The members of the workspace rooted at `root`, by name.
    const membersAt = new Map();
    const workspaceMembers = (root, globs) => {
        const cached = membersAt.get(root);
        if (cached !== undefined)
            return cached;
        const members = inRepoPackages().filter((pkg) => isMemberDir(root, globs, pkg.dir));
        const index = indexByName(members);
        membersAt.set(root, index);
        return index;
    };
    // tsconfig chain: the resolved view of one config file (its own options merged over its
    // `extends` chain). `null` marks a file being resolved, so an `extends` cycle reads as
    // unknown instead of recursing forever.
    const configCache = new Map();
    const resolveExtends = (configFile, ext) => {
        const fromDir = dirOf(configFile);
        if (ext.startsWith('.') || ext.startsWith('/')) {
            if (ext.startsWith('/'))
                return 'unknown';
            const joined = joinUnder(fromDir, ext);
            if (joined === undefined)
                return 'unknown';
            for (const cand of [joined, `${joined}.json`, `${joined}/tsconfig.json`])
                if (isFile(cand))
                    return cand;
            return 'unknown'; // a relative base that is not there: its options are unknowable
        }
        // A package base (`@tsconfig/node20/tsconfig.json`, `@acme/tsconfig`): an in-repo package first, bound by rule 4c as a bare import from the config would be (tsc reads it from node_modules, where the package manager links only members and local dependencies, so a fixture with the name is never it), then an installed one under an ancestor node_modules.
        const split = splitPackageSpecifier(ext);
        if (split !== undefined) {
            const [name, sub] = split;
            const local = packageNamed(name, configFile);
            const roots = [];
            if (local !== undefined && local !== 'ambiguous')
                roots.push(local.dir);
            for (const d of ancestors(fromDir === '' ? 'x' : `${fromDir}/x`))
                roots.push(d === '' ? `node_modules/${name}` : `${d}/node_modules/${name}`);
            for (const root of roots) {
                const target = sub === '.' ? joinUnder(root, 'tsconfig.json') : joinUnder(root, sub);
                if (target === undefined)
                    continue;
                for (const cand of [target, `${target}.json`])
                    if (isFile(cand))
                        return cand;
            }
        }
        // Not installed: a published preset (the only kind a repository extends without
        // vendoring). Those set compiler flags, not `paths`/`baseUrl`, so it contributes none.
        return undefined;
    };
    // `${configDir}` (TypeScript 5.5) is the directory of the tsconfig in effect for the file — the leaf of the chain, not the base that spells it. A value using it is rewritten to a repo-root-anchored path (leading '/'), which `joinConfigPath` reads.
    const withConfigDir = (p, leafDir) => p.includes('${configDir}') ? `/${p.split('${configDir}').join(leafDir === '' ? '.' : leafDir)}` : p;
    // `files`, `include` and `exclude` as one config spells them, repo-rel: each resolves from the config's own directory, and an `include` or `exclude` spec tsc rejects (a `..` after `**`) is dropped.
    const ownLists = (json, dir, leafDir) => {
        const out = {};
        for (const field of ['files', 'include', 'exclude']) {
            const list = json[field];
            if (!Array.isArray(list))
                continue;
            out[field] = list
                .filter((p) => typeof p === 'string' && (field === 'files' || !dotDotAfterRecursion(p)))
                .map((p) => joinConfigPath(dir, withConfigDir(p, leafDir)))
                .filter((p) => p !== undefined);
        }
        return out;
    };
    const loadConfig = (file, leafDir) => {
        const key = `${file}\n${leafDir}`;
        const cached = configCache.get(key);
        if (cached === null)
            return 'unknown';
        if (cached !== undefined)
            return cached;
        configCache.set(key, null);
        const result = (() => {
            const json = readJson(file);
            if (!isRecord(json))
                return 'unknown';
            const dir = dirOf(file);
            let merged = {};
            const bases = json.extends === undefined ? [] : Array.isArray(json.extends) ? json.extends : [json.extends];
            for (const base of bases) {
                if (typeof base !== 'string')
                    return 'unknown';
                const baseFile = resolveExtends(file, base);
                if (baseFile === 'unknown')
                    return 'unknown';
                if (baseFile === undefined)
                    continue;
                const inherited = loadConfig(baseFile, leafDir);
                if (inherited === 'unknown')
                    return 'unknown';
                merged = { ...merged, ...inherited };
            }
            const options = json.compilerOptions;
            if (options !== undefined && !isRecord(options))
                return 'unknown';
            if (options !== undefined && typeof options.baseUrl === 'string') {
                const base = joinConfigPath(dir, withConfigDir(options.baseUrl, leafDir));
                if (base === undefined)
                    return 'unknown';
                merged.baseUrl = base;
            }
            if (options !== undefined && options.paths !== undefined) {
                if (!isRecord(options.paths))
                    return 'unknown';
                const map = {};
                for (const [k, v] of Object.entries(options.paths)) {
                    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string'))
                        return 'unknown';
                    map[k] = v.map((p) => withConfigDir(p, leafDir));
                }
                merged.paths = { base: dir, map };
            }
            // `outDir` and `declarationDir` resolve from the config that sets them, like every path option; one outside the repository excludes nothing in it.
            for (const field of ['outDir', 'declarationDir']) {
                const value = options?.[field];
                if (typeof value !== 'string')
                    continue;
                const at = joinConfigPath(dir, withConfigDir(value, leafDir));
                if (at === undefined)
                    delete merged[field];
                else
                    merged[field] = at;
            }
            // A base's `files`, `include` or `exclude` list is inherited whole unless the inheriting config sets its own.
            return { ...merged, ...ownLists(json, dir, leafDir) };
        })();
        configCache.set(key, result);
        return result;
    };
    // Whether a config's project holds a file, as tsc reads `files`, `include` and `exclude`: a listed file always; otherwise an `include` match (tsc's matcher, {@link includeMatches}) that no `exclude` pattern matches. With neither `files` nor `include` set, `include` is everything under the config's directory; with only `files` set, it is nothing. With no `exclude` anywhere in the chain, `outDir` and `declarationDir` are excluded. An exclude pattern also covers everything under a directory it matches, the config's own directory included. Extensions are not filtered: a project holds whatever its compiler (tsc, vue-tsc, svelte-check) accepts.
    const holds = (config, configDir, file) => {
        if (config.files?.includes(file))
            return true;
        const include = config.include ?? (config.files === undefined ? [configDir === '' ? '**/*' : `${configDir}/**/*`] : []);
        if (!include.some((p) => includeMatches(p, file)))
            return false;
        const exclude = config.exclude ?? [config.outDir, config.declarationDir].filter((d) => d !== undefined);
        const segs = file.split('/');
        return !exclude.some((p) => p === '' || segs.some((_, k) => globMatches(p, segs.slice(0, k + 1).join('/'))));
    };
    // The configs a tsconfig's own `references` name (never inherited): a config file, or a directory holding a tsconfig.json. A reference naming neither is skipped, as tsserver skips it.
    const referencesOf = (file) => {
        const json = readJson(file);
        const refs = isRecord(json) && Array.isArray(json.references) ? json.references : [];
        const out = [];
        for (const ref of refs) {
            const target = isRecord(ref) && typeof ref.path === 'string' ? joinUnder(dirOf(file), ref.path) : undefined;
            if (target === undefined)
                continue;
            const found = [target, target === '' ? 'tsconfig.json' : `${target}/tsconfig.json`].find(isFile);
            if (found !== undefined)
                out.push(found);
        }
        return out;
    };
    // `paths` resolve from the directory of the config that declares them unless a `baseUrl` is in effect (TypeScript 4.1+).
    const view = (config) => ({
        ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
        ...(config.paths !== undefined ? { paths: { base: config.baseUrl ?? config.paths.base, map: config.paths.map } } : {}),
    });
    // Whether a referenced config whose options cannot be read may hold a file. tsc reads such a config without the bases it cannot read (a generated base absent from the commit), so it holds what the `files` and `include` of the configs in its chain it can read name, or by default what lies under its own directory; here its own directory always counts and every `exclude` is ignored, so the answer errs towards holding, which is towards silence. A referenced config that does not parse may hold anything.
    const mayHold = (file, fromFile) => {
        const dir = dirOf(file);
        if (dir === '' || fromFile.startsWith(`${dir}/`))
            return true;
        const seen = new Set();
        const names = (cfg) => {
            if (seen.has(cfg))
                return false;
            seen.add(cfg);
            const json = readJson(cfg);
            if (!isRecord(json))
                return cfg === file;
            const own = ownLists(json, dirOf(cfg), dir);
            if (own.files?.includes(fromFile) || own.include?.some((p) => includeMatches(p, fromFile)))
                return true;
            const bases = json.extends === undefined ? [] : Array.isArray(json.extends) ? json.extends : [json.extends];
            return bases.some((base) => {
                const baseFile = typeof base === 'string' ? resolveExtends(cfg, base) : undefined;
                return baseFile !== undefined && baseFile !== 'unknown' && names(baseFile);
            });
        };
        return names(file);
    };
    // The options in effect for a file whose nearest config is `file`. A solution-style config (one with `references` whose own project does not hold the file, as `files: []` holds nothing) defers to the referenced configs that hold it, searched through the whole reference tree as tsserver and `tsc -b` search it: when they agree on `baseUrl` and `paths`, those; when they disagree, or one cannot be read and may hold the file, 'unknown'; when none holds it, the nearest config's own options.
    const configInEffect = (file, fromFile) => {
        const own = loadConfig(file, dirOf(file));
        if (own === 'unknown')
            return 'unknown';
        const references = referencesOf(file);
        if (references.length === 0 || holds(own, dirOf(file), fromFile))
            return view(own);
        const holding = [];
        const seen = new Set([file]);
        const search = (configs) => {
            for (const ref of configs) {
                if (seen.has(ref))
                    continue;
                seen.add(ref);
                const loaded = loadConfig(ref, dirOf(ref));
                if (loaded === 'unknown') {
                    if (mayHold(ref, fromFile))
                        return false;
                }
                else if (holds(loaded, dirOf(ref), fromFile))
                    holding.push(view(loaded));
                if (!search(referencesOf(ref)))
                    return false;
            }
            return true;
        };
        if (!search(references))
            return 'unknown';
        if (holding.length === 0)
            return view(own);
        const first = JSON.stringify(holding[0]);
        return holding.every((v) => JSON.stringify(v) === first) ? holding[0] : 'unknown';
    };
    const nearestConfigByDir = new Map();
    const configByFile = new Map();
    const tsconfigFor = (fromFile) => {
        // A Vue or Svelte component reads jsconfig.json as a JavaScript file does: its language tools (Volar, svelte-check) take the nearest tsconfig.json or jsconfig.json.
        const isJs = /\.(?:[cm]?js|jsx|vue|svelte)$/i.test(fromFile);
        const kind = isJs ? 'js' : 'ts';
        const fileKey = `${kind}\n${fromFile}`;
        if (configByFile.has(fileKey))
            return configByFile.get(fileKey);
        const dirKey = `${kind}\n${dirOf(fromFile)}`;
        if (!nearestConfigByDir.has(dirKey)) {
            const names = isJs ? ['tsconfig.json', 'jsconfig.json'] : ['tsconfig.json'];
            let nearest;
            for (const dir of ancestors(fromFile)) {
                nearest = names.map((nm) => (dir === '' ? nm : `${dir}/${nm}`)).find(isFile);
                if (nearest !== undefined)
                    break;
            }
            nearestConfigByDir.set(dirKey, nearest);
        }
        const nearest = nearestConfigByDir.get(dirKey);
        const found = nearest === undefined ? undefined : configInEffect(nearest, fromFile);
        configByFile.set(fileKey, found);
        return found;
    };
    const nearestPackage = (fromFile) => {
        for (const dir of ancestors(fromFile)) {
            const pkg = packageAt(dir);
            if (pkg !== undefined)
                return pkg;
        }
        return undefined;
    };
    // The package whose dependencies a file sees: the nearest package.json that names a package, declares dependencies or declares a workspace. One that does none of these (a `{"type": "module"}` marker) installs nothing, so the files under it see the dependencies of the package around it.
    const dependencyOwner = (fromFile) => {
        for (const dir of ancestors(fromFile)) {
            const pkg = packageAt(dir);
            if (pkg === undefined)
                continue;
            const { manifest } = pkg;
            if (typeof manifest.name === 'string' || manifest.workspaces !== undefined || DEPENDENCY_FIELDS.some((f) => manifest[f] !== undefined))
                return pkg;
        }
        return undefined;
    };
    // Rule 4c. A package resolves its own name through its `exports` before anything else, as Node and TypeScript self-reference; a local spec in the importer's own package.json is what the package manager links under that name; otherwise the workspace declarations above the importer decide which in-repo packages are linked by name at all.
    const packageNamed = (name, fromFile) => {
        // Self-reference reads the package scope, the nearest package.json (a marker included, as Node reads it), and only one with `exports` resolves its own name.
        const scope = nearestPackage(fromFile);
        if (scope !== undefined && scope.manifest.name === name && scope.manifest.exports !== undefined && scope.manifest.exports !== null)
            return scope;
        let lookup = name;
        const own = dependencyOwner(fromFile);
        const field = own === undefined ? undefined : DEPENDENCY_FIELDS.map((f) => own.manifest[f]).find((d) => isRecord(d) && Object.hasOwn(d, name));
        const spec = isRecord(field) ? field[name] : undefined;
        if (own !== undefined && typeof spec === 'string') {
            const local = /^(?:file|link|portal):(.*)$/.exec(spec) ?? /^workspace:(\.{1,2}(?:\/.*)?)$/.exec(spec);
            if (local !== null) {
                // A relative path inside the repository; an absolute or home path is outside it.
                const dir = /^(?:[/~\\]|[A-Za-z]:)/.test(local[1]) ? undefined : joinUnder(own.dir, local[1]);
                return dir === undefined ? undefined : packageAt(dir);
            }
            const alias = /^workspace:((?:@[^/@]+\/)?[^/@]+)@/.exec(spec);
            if (alias !== null)
                lookup = alias[1];
        }
        // The nearest workspace declaration above the importer, then each enclosing one while the declaring directory is a member of it: npm and pnpm install a member from the enclosing root and ignore its own declaration, and yarn links nested worktrees into one project, so the enclosing members are linked too. A name two of them bind to different packages is ambiguous (npm takes the enclosing one, yarn refuses the pair). A declaration that is no member of the one above is a project installed on its own, whose node_modules may hold a registry package under any name, so nothing above it is looked at.
        let found;
        let declared;
        for (const dir of ancestors(fromFile)) {
            const globs = workspaceGlobs(dir);
            if (globs === undefined)
                continue;
            if (declared !== undefined && !isMemberDir(dir, globs, declared))
                break;
            const hit = workspaceMembers(dir, globs).get(lookup);
            if (hit !== undefined && found !== undefined && hit !== found)
                return 'ambiguous';
            found ??= hit;
            declared = dir;
        }
        return declared !== undefined ? found : packageIndex().get(lookup);
    };
    return {
        tsconfigFor,
        nearestPackage,
        packageNamed,
        packageAt,
        ...(isExcluded !== undefined ? { isExcluded } : {}),
    };
}
