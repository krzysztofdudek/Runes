import { USINGS_KEY, baseListKey, fileBaseListKey, fileInterfaceKey, FILE_TYPE_REF, referencedTypeKey, decodeUsings, decodeWritten, writtenReadings, interfaceKey, membersKey, decodeMembers, methodsKey, decodeMethods, shapeTakes, extensionShapesKey, enumKey, convertsKey } from './csharp.mjs';
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
/** The predefined types a value of each predefined numeric type converts to implicitly (C# spec §10.2.3), beside its own. A variable converts as its type says; only a constant converts further. */
const NUMERIC_WIDENING = {
    sbyte: ['short', 'int', 'long', 'float', 'double', 'decimal'],
    byte: ['short', 'ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'],
    short: ['int', 'long', 'float', 'double', 'decimal'],
    ushort: ['int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'],
    int: ['long', 'float', 'double', 'decimal'],
    uint: ['long', 'ulong', 'float', 'double', 'decimal'],
    long: ['float', 'double', 'decimal'],
    ulong: ['float', 'double', 'decimal'],
    char: ['ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'],
    float: ['double'],
};
/** The predefined types whose conversions are all in the language: a value of one converts to another only as `NUMERIC_WIDENING` says. `nint`, `nuint` and `dynamic` are left out, and so nothing is concluded for them. */
const CLOSED_PREDEFINED = new Set(['bool', 'byte', 'sbyte', 'char', 'decimal', 'double', 'float', 'int', 'uint', 'long', 'ulong', 'short', 'ushort', 'string', 'object']);
/** Framework structs that take no value of a predefined type and no enum value: none declares an implicit conversion from one. */
const FRAMEWORK_STRUCTS = new Set(['Guid', 'DateTime', 'DateTimeOffset', 'TimeSpan', 'DateOnly', 'TimeOnly', 'CancellationToken']);
/** The framework types an enum value converts to: its base classes, the interfaces `System.Enum` implements, and its own nullable form. */
const ENUM_TAKERS = new Set(['Object', 'ValueType', 'Enum', 'IComparable', 'IFormattable', 'IConvertible', 'ISpanFormattable', 'IUtf8SpanFormattable', 'Nullable']);
/**
 * The lookup over one symbol table. `bind` gives the key of the one type an ordered group of readings binds for the file that wrote it, or undefined when it binds none or more than one; the resolver passes its own reading of a hint, so a base is found exactly as a reference to it is. `declared` says whether some reading of such a group names a declaration that file can see at all: where `bind` gives nothing and `declared` answers no, the name is a type from outside the repository. Without it every unbound name may be a type of the repository.
 */
export function makeCsharpTypeLookup(table, bind, declared = () => true) {
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
    /** A type as this lookup holds it: the key of a published type, or for a `file` type its reference and its file, parted by a tab. No key of the table has that form, so nothing recorded under the published key of the same name (a nested type, a member, a method, the interface mark) is ever read for a `file` type. */
    const idOf = (type, fromFile) => (type.startsWith(FILE_TYPE_REF) ? `${type}\t${fromFile ?? ''}` : type);
    /** The base records of the type `id` with the files each is read in: those of every part of a published type, and for a `file` type those its own file declares (see `fileBaseListKey`), read as that file reads a name. `holder` is the key the type declares. */
    const baseRecords = (id) => {
        const tab = id.indexOf('\t');
        if (tab === -1)
            return { holder: id, records: table.valuesOf(LANGUAGE, baseListKey(id)) };
        const holder = referencedTypeKey(id.slice(0, tab));
        const file = id.slice(tab + 1);
        return { holder, records: table.valuesOf(LANGUAGE, fileBaseListKey(holder)).filter(({ files }) => files.includes(file)).map(({ value }) => ({ value, files: [file] })) };
    };
    const bases = (typeKey) => {
        const known = memo.get(typeKey);
        if (known !== undefined)
            return known;
        const result = { inside: [], outside: [] };
        // Set before the bases are bound: a base list that names its own type through itself ends here.
        memo.set(typeKey, result);
        const { holder, records } = baseRecords(typeKey);
        for (const { value, files } of records) {
            for (const { name, key } of boundIn(value, files, holder)) {
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
    /** Whether the type `id` is an interface: the mark of a published type, or for a `file` type the mark its own file declares (`fileInterfaceKey`). */
    const isInterface = (id) => {
        const tab = id.indexOf('\t');
        if (tab === -1)
            return table.has(LANGUAGE, interfaceKey(id));
        return table.filesFor(LANGUAGE, fileInterfaceKey(referencedTypeKey(id.slice(0, tab)))).includes(id.slice(tab + 1));
    };
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
    /** The instance methods of a type with the file each record is read in (its first: parts that write the same record write the same types). */
    const methodsMemo = new Map();
    const methodsOf = (typeKey) => {
        let listed = methodsMemo.get(typeKey);
        if (listed === undefined)
            methodsMemo.set(typeKey, (listed = table.valuesOf(LANGUAGE, methodsKey(typeKey)).flatMap(({ value, files }) => decodeMethods(value).map((m) => ({ ...m, file: files[0] })))));
        return listed;
    };
    const isEnum = (typeKey) => table.has(LANGUAGE, enumKey(typeKey));
    const converts = (typeKey) => table.has(LANGUAGE, convertsKey(typeKey));
    const argOf = (arg, fromFile) => {
        if (arg === null)
            return undefined;
        if (typeof arg === 'string')
            return CLOSED_PREDEFINED.has(arg) ? { predefined: arg } : undefined;
        if ('type' in arg) {
            const key = bind(arg.type, fromFile);
            return key === undefined ? undefined : { key };
        }
        // A member read through a name: where the nearest type around the call that knows the name has it as a member, the name is a value and its type is not written here.
        for (const type of arg.unless?.types ?? []) {
            const found = simpleName(idOf(type, fromFile), arg.unless.name);
            if (found === 'member')
                return undefined;
            if (found === 'type')
                break;
        }
        const key = bind(arg.member, fromFile);
        return key !== undefined && isEnum(key) ? { key } : undefined;
    };
    const argsMemo = new WeakMap();
    const argsOf = (argTypes, fromFile) => {
        let byFile = argsMemo.get(argTypes);
        if (byFile === undefined)
            argsMemo.set(argTypes, (byFile = new Map()));
        let args = byFile.get(fromFile);
        if (args === undefined)
            byFile.set(fromFile, (args = argTypes.map((a) => argOf(a, fromFile))));
        return args;
    };
    /** Every type of the repository `typeKey` derives from or implements, to any depth, and whether its conversions are all known: no base of it leaves the repository, and neither it nor a base declares an implicit conversion operator. */
    const ancestryMemo = new Map();
    const ancestry = (typeKey) => {
        let known = ancestryMemo.get(typeKey);
        if (known !== undefined)
            return known;
        const all = new Set();
        let closed = true;
        const pending = [typeKey];
        for (let i = 0; i < pending.length; i++) {
            const { inside, outside } = bases(pending[i]);
            if (outside.length > 0 || converts(pending[i]))
                closed = false;
            for (const b of inside) {
                if (all.has(b) || b === typeKey)
                    continue;
                all.add(b);
                pending.push(b);
            }
        }
        ancestryMemo.set(typeKey, (known = { all, closed }));
        return known;
    };
    /** True when a parameter written `param` in the record of a method of `holder` (read in `file`) cannot take an argument of the type `arg`, for certain: every answer that needs something this reader does not know is no. */
    const cannotTake = (param, arg, holder, file) => {
        if (!param.includes(':')) {
            // A predefined parameter type: `object` takes everything, the others what the language's own conversions give.
            if (!CLOSED_PREDEFINED.has(param) || param === 'object')
                return false;
            if ('predefined' in arg)
                return arg.predefined !== param && !(NUMERIC_WIDENING[arg.predefined] ?? []).includes(param);
            return isEnum(arg.key) || ancestry(arg.key).closed;
        }
        const written = decodeWritten(param);
        const usings = usingsOf(file);
        const readings = writtenReadings(written, holder, true, usings);
        const key = bind(readings, file);
        if (key !== undefined) {
            // A type of the repository: it takes what derives from it or implements it, and what an implicit conversion operator of either side turns into it.
            if (converts(key))
                return false;
            if ('predefined' in arg)
                return true;
            if (arg.key === key || ancestry(arg.key).all.has(key))
                return false;
            return isEnum(arg.key) || ancestry(arg.key).closed;
        }
        // A name that binds no one type: it may be a type of the repository after all (two declarations), or an alias, and then nothing is concluded.
        const lead = written.name.split(/[.:]/)[0];
        if (declared(readings, file) || usings.scope.aliasDecls.has(lead))
            return false;
        const simple = written.name.split(/[.:]/).pop().replace(/`\d+$/, '');
        if ('predefined' in arg)
            return FRAMEWORK_STRUCTS.has(simple);
        return isEnum(arg.key) && !ENUM_TAKERS.has(simple);
    };
    /** True when the method `method` of `holder` cannot take one of `args` (see `cannotTake`). */
    const refuses = (method, holder, args) => method.params !== undefined && args.some((arg, i) => arg !== undefined && (method.params[i] ?? '') !== '' && cannotTake(method.params[i], arg, holder, method.file));
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
    const hasMethod = (typeKey, call, from, fromFile) => {
        const args = call.argTypes === undefined || fromFile === undefined ? [] : argsOf(call.argTypes, fromFile);
        for (const declaring of lineage(typeKey)) {
            for (const method of methodsOf(declaring)) {
                if (method.name !== call.method || !shapeTakes(method.shape, call.typeArgs, call.args) || refuses(method, declaring, args))
                    continue;
                if (method.reach === 'public')
                    return true;
                // A protected method is reached through an instance only when the instance's type is the calling type or derives from it (C# spec §7.5.4, CS1540).
                if (method.reach === 'private' ? from.includes(declaring) : from.some((type) => lineage(type).includes(declaring) && lineage(typeKey).includes(type)))
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
    const shapesMemo = new Map();
    const extensionTakes = (key, file, call) => {
        let byFile = shapesMemo.get(key);
        if (byFile === undefined) {
            shapesMemo.set(key, (byFile = new Map()));
            for (const { value, files } of table.valuesOf(LANGUAGE, extensionShapesKey(key))) {
                for (const f of files)
                    byFile.set(f, [...(byFile.get(f) ?? []), ...value.split(' ')]);
            }
        }
        const shapes = byFile.get(file);
        return shapes === undefined || shapes.some((shape) => shapeTakes(shape, call.typeArgs, call.args));
    };
    return {
        extensionTakes,
        bases: (typeKey, fromFile) => bases(idOf(typeKey, fromFile)),
        nested: (typeKey, name, fromFile) => nested(idOf(typeKey, fromFile), name),
        simpleName: (typeKey, name, fromFile) => simpleName(idOf(typeKey, fromFile), name),
        path: (typeKey, segments, fromFile) => path(idOf(typeKey, fromFile), segments),
        attributeClass,
        hasMethod: (typeKey, call, from, fromFile) => hasMethod(idOf(typeKey, fromFile), call, from.map((type) => idOf(type, fromFile)), fromFile),
        memberTypes: (typeKey, name, fromFile) => memberTypes(idOf(typeKey, fromFile), name),
    };
}
