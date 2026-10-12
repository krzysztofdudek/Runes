import path from 'node:path';
/**
 * The MSBuild reading shared by the two C# project readers: the global-using scoping (`csharp-project.mts`) and the reference graph (`csharp-reach.mts`). Internal: nothing here is exported from the package.
 *
 * The XML reading is deliberately narrow (start tags, a few properties) and never evaluates a condition or a property.
 */
/** The attributes of one XML start tag's attribute text, keys lower-cased. */
export function attributes(attrText) {
    const out = new Map();
    const re = /([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(attrText)) !== null)
        out.set(m[1].toLowerCase(), (m[2] ?? m[3] ?? '').trim());
    return out;
}
/** The text with XML comments removed. */
export function stripComments(xml) {
    return xml.replace(/<!--[\s\S]*?-->/g, '');
}
/** The last value of `<Name>value</Name>` in the text, or undefined. */
export function lastProperty(xml, name) {
    const re = new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`, 'gi');
    let value;
    let m;
    while ((m = re.exec(xml)) !== null)
        value = m[1].trim();
    return value;
}
/** True for the name of a C# project file. */
export function isCsproj(name) {
    return name.toLowerCase().endsWith('.csproj');
}
/** The locator over one file source. */
export function makeProjectLocator(source) {
    const listings = new Map();
    const list = (dir) => {
        const hit = listings.get(dir);
        if (hit !== undefined)
            return hit;
        const names = (source.list(dir) ?? []).map((e) => e.name).sort();
        listings.set(dir, names);
        return names;
    };
    const ancestors = (dir) => {
        // path.posix.dirname never yields ''; it is a fixed point at the root ('.', or '/').
        const out = [dir];
        for (let up = path.posix.dirname(dir); up !== out[out.length - 1]; up = path.posix.dirname(up))
            out.push(up);
        return out;
    };
    const projectDirOf = (file) => {
        for (const dir of ancestors(path.posix.dirname(file))) {
            if (list(dir).some(isCsproj))
                return dir;
        }
        return null;
    };
    const nearestFile = (dir, basename) => {
        for (const d of ancestors(dir)) {
            if (list(d).includes(basename))
                return d === '.' ? basename : `${d}/${basename}`;
        }
        return undefined;
    };
    return { list, ancestors, projectDirOf, nearestFile };
}
