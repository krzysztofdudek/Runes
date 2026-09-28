import path from 'node:path';
import { readdirSync } from 'node:fs';
const NODE_FS = { readdirSync: (dir) => readdirSync(dir) };
/**
 * Returns a check that a repository-relative POSIX path is spelled, segment by segment, the way its directories list it.
 *
 * On a case-insensitive file system (the macOS and Windows defaults) `existsSync('lib/Root.rs')` is true when only `lib/root.rs` exists, so a resolver probing a module path would take a file under a name it does not have and report an edge to it. A probe that passed `existsSync` is confirmed here against the names `readdirSync` returns; on a case-sensitive file system the answer is always the same as the probe's. Names are compared after NFC normalisation, so a file stored decomposed (as macOS may store it) still matches a specifier written composed.
 *
 * A path that leaves the project root, or is absolute, is not checked (the answer is `true`): only segments under the root are compared. Each directory is listed at most once per check instance, so one instance belongs to one resolution pass, like the resolver's other caches.
 */
export function makeExactCaseCheck(projectRoot, fs = NODE_FS) {
    const listings = new Map();
    const listing = (dir) => {
        let names = listings.get(dir);
        if (names === undefined) {
            try {
                names = new Set(fs.readdirSync(path.resolve(projectRoot, dir)).map((n) => n.normalize('NFC')));
            }
            catch {
                names = null;
            }
            listings.set(dir, names);
        }
        return names;
    };
    return (repoRelPosix) => {
        const normalized = path.posix.normalize(repoRelPosix.replace(/\\/g, '/'));
        if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../'))
            return true;
        const segments = normalized.split('/').filter((s) => s !== '' && s !== '.');
        for (let i = 0; i < segments.length; i++) {
            const names = listing(segments.slice(0, i).join('/'));
            if (names === null || !names.has(segments[i].normalize('NFC')))
                return false;
        }
        return true;
    };
}
