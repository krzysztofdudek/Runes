import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { parseCompileCommands } from './extractors/include-resolve.mjs';
import { parseComposerAutoload } from './extractors/php-resolve.mjs';
/**
 * Repository-wide build-layout facts the C/C++ and PHP path resolvers need beyond the
 * importing file's own ancestors: every directory named `include` (the C/C++ probe roots),
 * every `composer.json` (the PHP autoload union), and the C/C++ compilation database.
 *
 * Everything is discovered LAZILY, at most once per factory instance (one resolver run),
 * and only when a resolver actually needs it: a repository without C/C++ or PHP never walks.
 * The walk skips dot-directories, `node_modules` and `vendor` (third-party trees whose
 * `composer.json` files describe installed packages, not this repository's own autoload
 * map), directories the caller excludes, and anything deeper than {@link MAX_DEPTH}; it stops
 * listing after {@link MAX_DIRS} directories so a pathological tree cannot stall a check.
 *
 * NOTE: like the other makeXResolveDeps factories this is pure filesystem access; it reads
 * and lists files, it does not parse source.
 */
const MAX_DEPTH = 12;
const MAX_DIRS = 50_000;
const SKIP_DIRS = new Set(['node_modules', 'vendor']);
export function makeRepoLayout(projectRoot, isExcluded) {
    let layout;
    const scan = () => {
        if (layout !== undefined)
            return layout;
        const found = { includeDirs: [], composerFiles: [] };
        const queue = [{ dir: '', depth: 0 }];
        let visited = 0;
        while (queue.length > 0 && visited < MAX_DIRS) {
            const { dir, depth } = queue.shift();
            visited++;
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
                    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name))
                        continue;
                    if (isExcluded?.(rel) === true)
                        continue;
                    if (e.name === 'include')
                        found.includeDirs.push(rel);
                    if (depth + 1 <= MAX_DEPTH)
                        queue.push({ dir: rel, depth: depth + 1 });
                }
                else if (e.isFile() && e.name === 'composer.json') {
                    if (isExcluded?.(rel) === true)
                        continue;
                    found.composerFiles.push(rel);
                }
            }
        }
        layout = found;
        return layout;
    };
    // The compilation database: `compile_commands.json` at the repository root, else in
    // `build/`. The first one that parses into at least one in-repo translation unit wins.
    let db;
    const compileDb = () => {
        if (db !== undefined)
            return db ?? undefined;
        db = null;
        for (const dir of ['', 'build']) {
            const abs = path.join(projectRoot, dir, 'compile_commands.json');
            let text;
            try {
                text = readFileSync(abs, 'utf-8');
            }
            catch {
                continue;
            }
            const parsed = parseCompileCommands(text, path.dirname(abs), path.resolve(projectRoot));
            if (parsed !== undefined) {
                db = parsed;
                break;
            }
        }
        return db ?? undefined;
    };
    let probe;
    const includeRoots = {
        compileDbRoots: (fromFile) => compileDb()?.rootsFor(fromFile),
        probeRoots: () => (probe ??= ['', ...scan().includeDirs]),
        isExcluded,
    };
    let maps;
    const composerMaps = () => {
        if (maps !== undefined)
            return maps;
        maps = [];
        for (const file of scan().composerFiles) {
            let text;
            try {
                text = readFileSync(path.join(projectRoot, file), 'utf-8');
            }
            catch {
                continue;
            }
            const dir = path.posix.dirname(file);
            maps.push(parseComposerAutoload(text, dir === '.' ? '' : dir));
        }
        return maps;
    };
    return { includeRoots, composerMaps };
}
