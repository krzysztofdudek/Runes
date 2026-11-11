import { baseListKey, decodeBase, interfaceKey } from './csharp.mjs';
/** The names a base list writes `System.Attribute` by when the repository declares no type of that name in scope. */
const ATTRIBUTE_BASE_NAMES = new Set(['System.Attribute', 'Attribute']);
/**
 * Which of an attribute's two readings C# takes (spec §23.3), from what each binds: `written` and `suffixed` are the attribute-class answers of the types the written name and the `Attribute`-suffixed name bind (undefined where the reading binds no type of the repository), and `hasSuffixed` says whether the attribute has a suffixed reading at all (a written name that already ends in `Attribute` has none). A reading that binds an attribute class is the result, and both doing so is the compiler's error CS1614, which gives nothing. A type that only may be one is taken as the suffixed reading, the name the convention gives an attribute class, and as the written reading only where no suffixed reading exists; a written name without the suffix that only may be one, beside nothing suffixed in the repository, gives nothing: the attribute is then most likely the framework's.
 */
export function attributeReading(written, suffixed, hasSuffixed) {
    if (written === 'yes')
        return suffixed === 'yes' ? undefined : 'written';
    if (suffixed === 'yes' || suffixed === 'maybe')
        return 'suffixed';
    return written === 'maybe' && !hasSuffixed ? 'written' : undefined;
}
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
    const attributeMemo = new Map();
    const attributeClass = (typeKey) => {
        const known = attributeMemo.get(typeKey);
        if (known !== undefined)
            return known;
        // Set before the bases are asked: a base chain that leads back here adds nothing.
        attributeMemo.set(typeKey, 'no');
        let answer = 'no';
        if (!isInterface(typeKey)) {
            const { inside, outside } = bases(typeKey);
            const through = inside.filter((b) => !isInterface(b)).map(attributeClass);
            if (outside.some((name) => ATTRIBUTE_BASE_NAMES.has(name)) || through.includes('yes'))
                answer = 'yes';
            else if (outside.length > 0 || through.includes('maybe'))
                answer = 'maybe';
        }
        attributeMemo.set(typeKey, answer);
        return answer;
    };
    return { bases, nested, path, attributeClass };
}
