import path from 'node:path';
import { parseCompileCommands } from './extractors/include-resolve.mjs';
import { parseComposerAutoload } from './extractors/php-resolve.mjs';
import { joinRel } from './file-view.mjs';
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
 * NOTE: like the other makeXResolveDeps factories this reads and lists files through the `files` source (the disk or a caller's view); it does not parse source. `projectRoot` is only the base the compilation database's absolute paths are made relative to.
 */
const MAX_DEPTH = 12;
const MAX_DIRS = 50_000;
const SKIP_DIRS = new Set(['node_modules', 'vendor']);
export function makeRepoLayout(projectRoot, files, isExcluded) {
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
            const entries = files.list(dir);
            if (entries === undefined)
                continue;
            for (const e of entries) {
                const rel = joinRel(dir, e.name);
                if (e.kind === 'dir') {
                    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name))
                        continue;
                    if (isExcluded?.(rel) === true)
                        continue;
                    if (e.name === 'include')
                        found.includeDirs.push(rel);
                    if (depth + 1 <= MAX_DEPTH)
                        queue.push({ dir: rel, depth: depth + 1 });
                }
                else if (e.kind === 'file' && e.name === 'composer.json') {
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
            const text = files.read(joinRel(dir, 'compile_commands.json'));
            if (text === undefined)
                continue;
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
            const text = files.read(file);
            if (text === undefined)
                continue;
            const dir = path.posix.dirname(file);
            maps.push(parseComposerAutoload(text, dir === '.' ? '' : dir));
        }
        return maps;
    };
    return { includeRoots, composerMaps };
}
