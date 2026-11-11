import { USINGS_KEY, baseListKey, fileBaseListKey, decodeUsings, decodeWritten, writtenReadings, interfaceKey, membersKey, decodeMembers, methodsKey, decodeMethods, shapeTakes } from './csharp.mjs';
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
    /** What each file reads a written name with (its `usings` record), read from the table when first asked. */
    let usingsByFile;
    const NO_USINGS = decodeUsings('{}');
    const usingsOf = (file) => {
        if (usingsByFile === undefined) {
            usingsByFile = new Map();
            for (const { value, files } of table.valuesOf(LANGUAGE, USINGS_KEY)) {
                const usings = decodeUsings(value);
                for (const f of files)
                    usingsByFile.set(f, usings);
            }
        }
        return usingsByFile.get(file) ?? NO_USINGS;
    };
    /** The keys of the types the base a record writes names, one per file that declares the record, undefined where that file's reading binds no one type. */
    const boundIn = (value, files, holder) => {
        const written = decodeWritten(value);
        const name = written.name.startsWith('global::') ? written.name.slice('global::'.length) : written.name;
        return files.map((file) => ({ name, key: bind(writtenReadings(written, holder, false, usingsOf(file)), file) }));
    };
    const bases = (typeKey) => {
        const known = memo.get(typeKey);
        if (known !== undefined)
            return known;
        const result = { inside: [], outside: [] };
        // Set before the bases are bound: a base list that names its own type through itself ends here.
        memo.set(typeKey, result);
        // The bases of a `file` type of that key count only while one file declares them (see `fileBaseListKey`).
        const ofFileType = table.valuesOf(LANGUAGE, fileBaseListKey(typeKey));
        const oneFile = new Set(ofFileType.flatMap(({ files }) => files)).size === 1;
        for (const { value, files } of [...table.valuesOf(LANGUAGE, baseListKey(typeKey)), ...(oneFile ? ofFileType : [])]) {
            for (const { name, key } of boundIn(value, files, typeKey)) {
                if (key === undefined) {
                    if (!result.outside.includes(name))
                        result.outside.push(name);
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
    const membersMemo = new Map();
    const membersOf = (typeKey) => {
        let byName = membersMemo.get(typeKey);
        if (byName !== undefined)
            return byName;
        membersMemo.set(typeKey, (byName = new Map()));
        for (const { value, files } of table.valuesOf(LANGUAGE, membersKey(typeKey))) {
            for (const member of decodeMembers(value)) {
                let listed = byName.get(member.name);
                if (listed === undefined)
                    byName.set(member.name, (listed = { hidden: true, types: [] }));
                if (!member.hidden)
                    listed.hidden = false;
                if (member.type !== undefined)
                    for (const file of files)
                        listed.types.push({ written: member.type, file });
            }
        }
        return byName;
    };
    /** The lookup of `name` in `typeKey` and then in its base classes, nearest first: the nested types of the first level that has one, or, with `members`, the word that a level before it has a member of that name that is no type. */
    const find = (typeKey, name, members) => {
        const own = `${typeKey}+${name}`;
        if (table.has(LANGUAGE, own))
            return { keys: [own], member: false };
        if (members && membersOf(typeKey).has(name))
            return { keys: [], member: true, owners: [typeKey] };
        const seen = new Set([typeKey]);
        let level = inherited(typeKey);
        while (level.length > 0) {
            const found = [...new Set(level.map((b) => `${b}+${name}`))].filter((k) => table.has(LANGUAGE, k));
            if (found.length > 0)
                return { keys: found, member: false };
            const owners = members ? level.filter((b) => membersOf(b).get(name)?.hidden === false) : [];
            if (owners.length > 0)
                return { keys: [], member: true, owners };
            const next = [];
            for (const b of level) {
                if (seen.has(b))
                    continue;
                seen.add(b);
                next.push(...inherited(b));
            }
            level = next.filter((b) => !seen.has(b));
        }
        return { keys: [], member: false };
    };
    const nested = (typeKey, name) => find(typeKey, name, false).keys;
    const simpleName = (typeKey, name) => {
        const found = find(typeKey, name, true);
        return found.member ? 'member' : found.keys.length > 0 ? 'type' : 'none';
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
    const methodsMemo = new Map();
    const methodsOf = (typeKey) => {
        let listed = methodsMemo.get(typeKey);
        if (listed === undefined)
            methodsMemo.set(typeKey, (listed = table.valuesOf(LANGUAGE, methodsKey(typeKey)).flatMap(({ value }) => decodeMethods(value))));
        return listed;
    };
    /** The type `typeKey` and what it inherits members from, nearest first: its base classes, or for an interface its base interfaces. */
    const lineage = (typeKey) => {
        const seen = new Set();
        const pending = [typeKey];
        for (let i = 0; i < pending.length; i++) {
            if (seen.has(pending[i]))
                continue;
            seen.add(pending[i]);
            pending.push(...inherited(pending[i]));
        }
        return [...seen];
    };
    const hasMethod = (typeKey, call, from) => {
        for (const declaring of lineage(typeKey)) {
            for (const method of methodsOf(declaring)) {
                if (method.name !== call.method || !shapeTakes(method.shape, call.typeArgs, call.args))
                    continue;
                if (method.reach === 'public')
                    return true;
                if (method.reach === 'private' ? from.includes(declaring) : from.some((type) => lineage(type).includes(declaring)))
                    return true;
            }
        }
        return false;
    };
    const memberTypes = (typeKey, name) => {
        const keys = [];
        for (const owner of find(typeKey, name, true).owners ?? []) {
            for (const { written, file } of membersOf(owner).get(name).types) {
                const key = bind(writtenReadings(written, owner, true, usingsOf(file)), file);
                if (key !== undefined && !keys.includes(key))
                    keys.push(key);
            }
        }
        return keys;
    };
    return { bases, nested, simpleName, path, attributeClass, hasMethod, memberTypes };
}
