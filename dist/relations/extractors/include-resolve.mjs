import path from 'node:path';
export function resolveIncludePath(specifier, fromFile, exists, roots) {
    const angle = specifier.length >= 2 && specifier.startsWith('<') && specifier.endsWith('>');
    const name = toPosix(angle ? specifier.slice(1, -1) : specifier).trim();
    if (name === '' || name.startsWith('/') || /^[A-Za-z]:/.test(name))
        return undefined;
    // 1. Quoted: the includer's own directory first — the compiler takes this hit before any
    //    root, so it is never subject to the ambiguity rule.
    if (!angle) {
        const fromDir = path.posix.dirname(toPosix(fromFile));
        const relative = normalizeRepoRel(path.posix.join(fromDir, name));
        if (relative !== undefined && exists(relative))
            return relative;
    }
    if (roots === undefined)
        return undefined;
    // 2. Include roots: the compilation database when there is one, else the probe.
    let candidates;
    const db = roots.compileDbRoots(fromFile);
    if (db !== undefined) {
        candidates = angle ? db.angle : [...db.quote, ...db.angle];
    }
    else {
        if (angle || !isProbeable(name))
            return undefined;
        candidates = roots.probeRoots();
    }
    const hits = new Set();
    for (const root of candidates) {
        const candidate = normalizeRepoRel(root === '' ? name : path.posix.join(root, name));
        if (candidate === undefined || !exists(candidate))
            continue;
        if (roots.isExcluded?.(candidate) === true)
            continue;
        hits.add(candidate);
    }
    if (hits.size !== 1)
        return undefined; // none, or ambiguous → silence
    return [...hits][0];
}
/** A quoted name the no-database probe may look up: 2+ segments, none of them `.`/`..`. */
function isProbeable(name) {
    const segs = name.split('/');
    if (segs.length < 2)
        return false;
    return segs.every((s) => s !== '' && s !== '.' && s !== '..');
}
/**
 * Parse a `compile_commands.json` (the JSON Compilation Database) into per-translation-unit
 * include roots. `dbDirAbs` is the absolute directory holding the database, `projectRoot` the
 * absolute repository root. Each entry's `directory` (absolute, or — leniently — relative to
 * the database's directory) anchors its `file` and its include flags. Recognised flags:
 * `-I<dir>`, `-I <dir>`, `--include-directory=<dir>`, `-iquote<dir>`, `-iquote <dir>`, and
 * for a `cl`/`clang-cl` driver `/I<dir>`, `/I <dir>`. `-isystem` and `-idirafter` are
 * deliberately ignored (system roots). Roots and files outside the repository are dropped.
 *
 * Returns undefined when the text is not a database or no entry names a file inside the
 * repository — the caller then behaves as though there were no database.
 */
export function parseCompileCommands(text, dbDirAbs, projectRoot) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    if (!Array.isArray(parsed))
        return undefined;
    const byFile = new Map();
    const allQuote = [];
    const allAngle = [];
    const toRepoRel = (abs) => {
        const rel = path.relative(projectRoot, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel))
            return undefined;
        const posix = toPosix(rel);
        return posix === '.' ? '' : posix;
    };
    for (const entry of parsed) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const e = entry;
        if (typeof e.directory !== 'string' || typeof e.file !== 'string')
            continue;
        const dirAbs = path.resolve(dbDirAbs, e.directory);
        const fileRel = toRepoRel(path.resolve(dirAbs, e.file));
        if (fileRel === undefined || fileRel === '')
            continue;
        let args;
        if (Array.isArray(e.arguments))
            args = e.arguments.filter((a) => typeof a === 'string');
        else if (typeof e.command === 'string')
            args = splitCommand(e.command);
        else
            continue;
        const msvc = args.length > 0 && /(^|[\\/])(clang-)?cl(\.exe)?$/i.test(args[0]);
        const roots = { quote: [], angle: [] };
        const add = (list, dir) => {
            const rel = toRepoRel(path.resolve(dirAbs, dir));
            if (rel === undefined)
                return;
            if (!list.includes(rel))
                list.push(rel);
        };
        for (let i = 1; i < args.length; i++) {
            const a = args[i];
            if (a === '-I' || (msvc && a === '/I')) {
                if (i + 1 < args.length)
                    add(roots.angle, args[++i]);
                continue;
            }
            if (a === '-iquote') {
                if (i + 1 < args.length)
                    add(roots.quote, args[++i]);
                continue;
            }
            if (a === '-isystem' || a === '-idirafter' || a === '--include-directory') {
                if (a === '--include-directory' && i + 1 < args.length)
                    add(roots.angle, args[i + 1]);
                i++;
                continue;
            }
            if (a.startsWith('--include-directory=')) {
                add(roots.angle, a.slice('--include-directory='.length));
                continue;
            }
            if (a.startsWith('-iquote')) {
                add(roots.quote, a.slice('-iquote'.length));
                continue;
            }
            if (a.startsWith('-I')) {
                add(roots.angle, a.slice(2));
                continue;
            }
            if (msvc && a.startsWith('/I')) {
                add(roots.angle, a.slice(2));
                continue;
            }
        }
        const existing = byFile.get(fileRel);
        if (existing === undefined)
            byFile.set(fileRel, roots);
        else {
            for (const q of roots.quote)
                if (!existing.quote.includes(q))
                    existing.quote.push(q);
            for (const q of roots.angle)
                if (!existing.angle.includes(q))
                    existing.angle.push(q);
        }
        for (const q of roots.quote)
            if (!allQuote.includes(q))
                allQuote.push(q);
        for (const q of roots.angle)
            if (!allAngle.includes(q))
                allAngle.push(q);
    }
    if (byFile.size === 0)
        return undefined;
    return {
        rootsFor(fromFile) {
            return byFile.get(toPosix(fromFile)) ?? { quote: allQuote, angle: allAngle };
        },
    };
}
/** Split a shell command line into arguments: whitespace-separated, with '…' and "…"
 *  quoting and backslash escapes outside single quotes. Enough for the flags read here. */
function splitCommand(command) {
    const out = [];
    let cur = '';
    let inArg = false;
    let quote;
    for (let i = 0; i < command.length; i++) {
        const c = command[i];
        if (quote !== undefined) {
            if (c === quote)
                quote = undefined;
            else if (c === '\\' && quote === '"' && i + 1 < command.length)
                cur += command[++i];
            else
                cur += c;
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            inArg = true;
            continue;
        }
        if (c === '\\' && i + 1 < command.length) {
            cur += command[++i];
            inArg = true;
            continue;
        }
        if (/\s/.test(c)) {
            if (inArg) {
                out.push(cur);
                cur = '';
                inArg = false;
            }
            continue;
        }
        cur += c;
        inArg = true;
    }
    if (inArg)
        out.push(cur);
    return out;
}
/** Normalize a repo-relative POSIX path; reject any that escapes the repo root. */
function normalizeRepoRel(p) {
    const norm = path.posix.normalize(p);
    if (norm === '..' || norm.startsWith('../') || norm.startsWith('/'))
        return undefined;
    return norm;
}
function toPosix(p) {
    return p.replace(/\\/g, '/');
}
