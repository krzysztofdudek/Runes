/**
 * Finds an installed npm package the way Node's resolution walks node_modules, without resolving through the package's `exports` (which may not expose package.json, as web-tree-sitter does not).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
export function findInstalledPackage(fromDir, pkg) {
    const lookup = createRequire(path.join(path.resolve(fromDir), 'noop.js')).resolve.paths(pkg) ?? [];
    for (const base of lookup) {
        const dir = path.join(base, pkg);
        const manifest = path.join(dir, 'package.json');
        if (!existsSync(manifest))
            continue;
        const version = JSON.parse(readFileSync(manifest, 'utf8')).version;
        return { dir, version };
    }
    return undefined;
}
