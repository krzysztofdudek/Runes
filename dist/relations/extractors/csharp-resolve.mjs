import { baseListKey, decodeBase, interfaceKey } from './csharp.mjs';
const LANGUAGE = 'csharp';
/**
 * The lookup over one symbol table. `bind` gives the key of the one type an ordered group of readings binds for the file that wrote it, or undefined when it binds none or more than one; the resolver passes its own reading of a hint, so a base is found exactly as a reference to it is.
 */
export function makeCsharpTypeLookup(table, bind) {
    const memo = new Map();
    const bases = (typeKey) => {
        const known = memo.get(typeKey);
        if (known !== undefined)
            return known;
        const result = { inside: [], outside: [] };
        // Set before the bases are bound: a base list that names its own type through itself ends here.
        memo.set(typeKey, result);
        for (const { value, files } of table.valuesOf(LANGUAGE, baseListKey(typeKey))) {
            const base = decodeBase(value);
            for (const file of files) {
                const key = bind(base.readings, file);
                if (key === undefined) {
                    if (!result.outside.includes(base.name))
                        result.outside.push(base.name);
                }
                else if (!result.inside.includes(key))
                    result.inside.push(key);
            }
        }
        return result;
    };
    const isInterface = (typeKey) => table.has(LANGUAGE, interfaceKey(typeKey));
    /** The bases a type inherits nested types from: its base class, or for an interface its base interfaces. */
    const inherited = (typeKey) => {
        const all = bases(typeKey).inside;
        return isInterface(typeKey) ? all : all.filter((b) => !isInterface(b));
    };
    const nested = (typeKey, name) => {
        const own = `${typeKey}+${name}`;
        if (table.has(LANGUAGE, own))
            return [own];
        const seen = new Set([typeKey]);
        let level = inherited(typeKey);
        while (level.length > 0) {
            const found = [...new Set(level.map((b) => `${b}+${name}`))].filter((k) => table.has(LANGUAGE, k));
            if (found.length > 0)
                return found;
            const next = [];
            for (const b of level) {
                if (seen.has(b))
                    continue;
                seen.add(b);
                next.push(...inherited(b));
            }
            level = next.filter((b) => !seen.has(b));
        }
        return [];
    };
    const path = (typeKey, segments) => {
        let current = [typeKey];
        for (const segment of segments) {
            current = [...new Set(current.flatMap((k) => nested(k, segment)))];
            if (current.length === 0)
                break;
        }
        return current;
    };
    return { bases, nested, path };
}
