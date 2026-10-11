import path from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { makeExactCaseCheck } from './exact-case.mjs';
/** A path of a listed view in its one spelling: `.` segments, doubled and trailing slashes dropped, `''` for the root. Undefined for a path that is absolute or climbs out of the root, which no listed view holds. */
function viewPath(p) {
    const plain = !/(?:^|\/)\.{1,2}(?:\/|$)|\/\/|^\/|\/$/.test(p);
    const n = plain ? p : path.posix.normalize(p).replace(/\/$/, '');
    if (n === '.' || n === '')
        return '';
    if (n.startsWith('/') || n === '..' || n.startsWith('../'))
        return undefined;
    return n;
}
/**
 * A {@link FileView} of exactly the files `paths` lists, read through `read`: the files of one commit, say, with a reader over its blobs. The directories are those the paths imply, the root always among them. Anything not listed does not exist: no symbolic link unless it is listed (as the file it stands for), no installed package, no build output. Names are compared exactly, so a probe spelled in another case than the listed name finds nothing, as on a case-sensitive file system.
 *
 * Each path is POSIX and relative to the project root (`./` segments and doubled slashes are read as one spelling); a path that is absolute or climbs out of the root is ignored. `read` is called only for a listed file, with the path as listed after that normalisation, and may return undefined for a file it cannot read; an exception it throws reaches the resolver's caller. The list is taken once, when the view is made.
 */
export function listedFileView(paths, read) {
    const files = new Set();
    // Directory → its entries by name. Every directory but the root is registered in its parent's map when its own map is made, so an existing map means its ancestors are registered.
    const children = new Map([['', new Map()]]);
    for (const raw of paths) {
        const p = viewPath(raw);
        if (p === undefined || p === '')
            continue;
        files.add(p);
        let child = p;
        let kind = 'file';
        for (;;) {
            const slash = child.lastIndexOf('/');
            const parent = slash === -1 ? '' : child.slice(0, slash);
            let entries = children.get(parent);
            const known = entries !== undefined;
            if (entries === undefined) {
                entries = new Map();
                children.set(parent, entries);
            }
            const name = child.slice(slash + 1);
            if (kind === 'dir' || !entries.has(name))
                entries.set(name, kind);
            if (known)
                break;
            child = parent;
            kind = 'dir';
        }
    }
    const listings = new Map();
    return {
        exists: (p) => {
            const n = viewPath(p);
            return n !== undefined && (files.has(n) || children.has(n));
        },
        isFile: (p) => {
            const n = viewPath(p);
            return n !== undefined && files.has(n);
        },
        isDirectory: (p) => {
            const n = viewPath(p);
            return n !== undefined && children.has(n);
        },
        list: (dir) => {
            const n = viewPath(dir);
            const entries = n === undefined ? undefined : children.get(n);
            if (n === undefined || entries === undefined)
                return undefined;
            let listing = listings.get(n);
            if (listing === undefined) {
                listing = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, kind]) => ({ name, kind }));
                listings.set(n, listing);
            }
            return listing;
        },
        read: (p) => {
            const n = viewPath(p);
            return n !== undefined && files.has(n) ? read(n) : undefined;
        },
    };
}
/**
 * The disk under `projectRoot`, read the way the resolvers of 1.0.x read it, so a caller that passes no view sees exactly what it saw before views existed. That reading has two manners, and each probe keeps its own:
 *
 * - `caseExact` — a candidate probe (does this module file exist, which `.go` or `.java` files does this package directory hold): the path is resolved against the root, and every segment must be spelled the way its directory lists it, so a case-insensitive file system cannot answer `lib/Root.rs` with `lib/root.rs` (see `makeExactCaseCheck`).
 * - otherwise — a configuration read or a repository walk (a `tsconfig.json`, a `Cargo.toml`, the project manifests a walk discovers): the path is joined under the root and the file system's own case rule applies.
 *
 * Listings report entries as the directory does, without following symbolic links (`readdirSync` with file types); `exists`, `isFile` and `isDirectory` follow them, as `existsSync` and `statSync` do.
 */
export function diskFileView(projectRoot, caseExact) {
    const exactCase = caseExact ? makeExactCaseCheck(projectRoot) : undefined;
    const at = (p) => (caseExact ? path.resolve(projectRoot, p) : path.join(projectRoot, p));
    const spelled = (p) => exactCase === undefined || exactCase(p);
    const stat = (p) => {
        try {
            return statSync(at(p));
        }
        catch {
            return undefined;
        }
    };
    return {
        exists: (p) => existsSync(at(p)) && spelled(p),
        isFile: (p) => (stat(p)?.isFile() ?? false) && spelled(p),
        isDirectory: (p) => (stat(p)?.isDirectory() ?? false) && spelled(p),
        list: (dir) => {
            if (!spelled(dir))
                return undefined;
            try {
                return readdirSync(at(dir), { withFileTypes: true }).map((e) => ({ name: e.name, kind: e.isFile() ? 'file' : e.isDirectory() ? 'dir' : 'other' }));
            }
            catch {
                return undefined;
            }
        },
        read: (p) => {
            if (!spelled(p))
                return undefined;
            try {
                return readFileSync(at(p), 'utf-8');
            }
            catch {
                return undefined;
            }
        },
    };
}
/** A repository-relative path of the entry `name` inside the directory `dir` (`''` is the root). */
export function joinRel(dir, name) {
    return dir === '' ? name : `${dir}/${name}`;
}
