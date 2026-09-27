import path from 'node:path';
/**
 * Resolve an FQN against a set of autoload maps with the exactly-one-hit rule.
 *   Stage A — named PSR-4 prefixes: per map, the LONGEST matching named prefix, every base
 *     directory of it. The hits of all maps are pooled.
 *   Stage B — only when stage A found no file: the fallbacks, i.e. each map's PSR-4 `""`
 *     directories (the whole FQN as a path under them) and every matching PSR-0 prefix
 *     (the whole FQN as a path, `_` in the class name → `/`).
 * Excluded hits are dropped first; one distinct live file → hit, 2+ → ambiguous, 0 → miss.
 */
function resolveInMaps(fqn, maps, deps) {
    const isExcl = deps.isExcluded ?? (() => false);
    const decide = (hits) => {
        const live = [...hits].filter((h) => !isExcl(h));
        if (live.length === 0)
            return undefined;
        if (live.length > 1)
            return { kind: 'ambiguous' };
        return { kind: 'hit', file: live[0] };
    };
    const fqnWithSep = fqn + '\\';
    const segments = fqn.split('\\').filter((x) => x.length > 0);
    const fullPath = segments.join('/') + '.php';
    const stageA = new Set();
    for (const map of maps) {
        let bestPrefix;
        for (const prefix of map.psr4.keys()) {
            if (prefix === '' || !fqnWithSep.startsWith(prefix))
                continue;
            if (bestPrefix === undefined || prefix.length > bestPrefix.length)
                bestPrefix = prefix;
        }
        if (bestPrefix === undefined)
            continue;
        const remainder = fqn.slice(bestPrefix.length).split('\\').filter((x) => x.length > 0);
        if (remainder.length === 0)
            continue;
        const subPath = remainder.join('/') + '.php';
        for (const baseDir of map.psr4.get(bestPrefix) ?? []) {
            const candidate = joinUnder(baseDir, subPath);
            if (deps.exists(candidate))
                stageA.add(candidate);
        }
    }
    const a = decide(stageA);
    if (a !== undefined)
        return a;
    const stageB = new Set();
    const psr0Path = psr0PathOf(segments);
    for (const map of maps) {
        for (const baseDir of map.psr4.get('') ?? []) {
            const candidate = joinUnder(baseDir, fullPath);
            if (deps.exists(candidate))
                stageB.add(candidate);
        }
        for (const [prefix, dirs] of map.psr0) {
            if (prefix !== '' && !fqn.startsWith(prefix))
                continue;
            for (const baseDir of dirs) {
                const candidate = joinUnder(baseDir, psr0Path);
                if (deps.exists(candidate))
                    stageB.add(candidate);
            }
        }
    }
    return decide(stageB) ?? { kind: 'miss' };
}
/** PSR-0 path of an FQN: namespace segments as directories, and `_` in the CLASS-name
 *  segment (never in the namespace) as a directory separator too. */
function psr0PathOf(segments) {
    const ns = segments.slice(0, -1);
    const cls = (segments[segments.length - 1] ?? '').split('_').filter((x) => x.length > 0);
    return [...ns, ...cls].join('/') + '.php';
}
/**
 * Resolve a statically file-relative `require`/`include` path. The extractor emits it as a
 * path relative to the includer's directory, always containing `/` (`./../lib/x.php`), which
 * no PHP FQN ever does. Joined to the includer's directory; a path that escapes the repository,
 * does not exist, or is excluded → undefined.
 */
function resolvePhpFilePath(specifier, fromFile, deps) {
    const fromDir = path.posix.dirname(fromFile.replace(/\\/g, '/'));
    const joined = path.posix.normalize(path.posix.join(fromDir === '.' ? '' : fromDir, specifier));
    if (joined === '..' || joined.startsWith('../') || joined.startsWith('/'))
        return undefined;
    if (!deps.exists(joined))
        return undefined;
    if (deps.isExcluded?.(joined) === true)
        return undefined;
    return joined;
}
export function resolvePhpFqn(specifier, fromFile, deps) {
    if (specifier.includes('/'))
        return resolvePhpFilePath(specifier, fromFile, deps);
    const fqn = specifier.startsWith('\\') ? specifier.slice(1) : specifier;
    if (fqn === '')
        return undefined;
    // 1. The nearest composer.json's maps. Ambiguous there → silence; a hit → done.
    const nearest = {
        psr4: deps.psr4For(fromFile),
        psr0: deps.psr0For?.(fromFile) ?? new Map(),
    };
    if (nearest.psr4.size > 0 || nearest.psr0.size > 0) {
        const r = resolveInMaps(fqn, [nearest], deps);
        if (r.kind === 'hit')
            return r.file;
        if (r.kind === 'ambiguous')
            return undefined;
    }
    // 2. Nothing in the nearest map: the union of every composer.json in the repository.
    const all = deps.allMaps?.() ?? [];
    if (all.length === 0)
        return undefined;
    const r = resolveInMaps(fqn, all, deps);
    return r.kind === 'hit' ? r.file : undefined;
}
/** Join a repo-relative directory with a sub-path, normalizing. '' → the sub-path itself. */
function joinUnder(dir, sub) {
    return path.posix.normalize(dir === '' ? sub : path.posix.join(dir, sub));
}
/**
 * Parse a composer.json's `autoload.psr-4` and `autoload-dev.psr-4` into the normalized
 * prefix → directories map, with directories made relative to `composerDir` (repo-rel
 * POSIX, '' = repo root). Exported for the disk-backed deps factory and for testing.
 *
 * A prefix is kept verbatim (it ends in `\` per PSR-4 convention). A directory value is
 * a single string or an array of strings; each is normalized (trailing slash dropped,
 * `.`/`''` → the composerDir itself). Malformed entries are skipped. autoload-dev keys
 * supplement the main map (a key present in both takes the union of directories).
 */
export function parsePsr4(composerJsonText, composerDir) {
    return parseAutoloadSection(composerJsonText, composerDir, 'psr-4');
}
/** Parse both autoload kinds of a composer.json (see {@link parsePsr4}); PSR-0 uses the same
 *  prefix → directories shape (a PSR-0 prefix need not end in `\`, e.g. `Twig_`). */
export function parseComposerAutoload(composerJsonText, composerDir) {
    return {
        psr4: parseAutoloadSection(composerJsonText, composerDir, 'psr-4'),
        psr0: parseAutoloadSection(composerJsonText, composerDir, 'psr-0'),
    };
}
function parseAutoloadSection(composerJsonText, composerDir, kind) {
    const out = new Map();
    let parsed;
    try {
        parsed = JSON.parse(composerJsonText);
    }
    catch {
        return out;
    }
    if (parsed === null || typeof parsed !== 'object')
        return out;
    const addSection = (section) => {
        if (section === null || typeof section !== 'object')
            return;
        for (const [prefix, value] of Object.entries(section)) {
            // An empty prefix is kept: Composer documents `"": "dir/"` as a fallback directory
            // for every namespace (resolution tries it only after every named prefix).
            const dirs = Array.isArray(value) ? value : [value];
            for (const d of dirs) {
                if (typeof d !== 'string')
                    continue;
                const rel = normalizeDir(d, composerDir);
                const existing = out.get(prefix);
                if (existing === undefined)
                    out.set(prefix, [rel]);
                else if (!existing.includes(rel))
                    existing.push(rel);
            }
        }
    };
    const autoload = parsed.autoload;
    const autoloadDev = parsed['autoload-dev'];
    if (autoload !== null && typeof autoload === 'object') {
        addSection(autoload[kind]);
    }
    if (autoloadDev !== null && typeof autoloadDev === 'object') {
        addSection(autoloadDev[kind]);
    }
    return out;
}
/** A composer.json directory value → repo-relative POSIX dir (no trailing slash).
 *  `composerDir` is where the composer.json lives ('' = repo root); the value is relative
 *  to it. `''`, `.`, `./` all denote composerDir itself. */
function normalizeDir(value, composerDir) {
    const trimmed = value.replace(/\/+$/, ''); // drop trailing slashes
    if (trimmed === '' || trimmed === '.')
        return composerDir;
    const joined = composerDir === '' ? trimmed : path.posix.join(composerDir, trimmed);
    const norm = path.posix.normalize(joined);
    return norm === '.' ? '' : norm;
}
