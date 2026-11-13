import { declarationCount } from './symbol-table.mjs';
import { isRubyExternalConstant } from './extractors/ruby-resolve.mjs';
import { IMPLICIT_PROGRAM_KEY, internalKey, referencedTypeKey, shapeTakes } from './extractors/csharp.mjs';
import { jvmSourceSetVisible } from './extractors/java-resolve.mjs';
import { attributeReading, makeCsharpTypeLookup } from './extractors/csharp-resolve.mjs';
/**
 * The ordered first-unique-match-wins walk over a detected reference's candidate group:
 * nearest binding first (member → enclosing namespace → unique using-import → verbatim),
 * farther candidates last. Returns the owner of the resolved binding, or undefined when
 * the group silences (a nearer candidate is present-but-ambiguous, or no candidate binds). For
 * a one-element group this is byte-identical to a single resolve.
 *
 * This is the SINGLE definition of the candidate walk, shared by the live relation pass and the
 * reference-case test runner so the two can never drift. Self-edge filtering and declared-
 * relation verification are the caller's concern (they happen at different stages).
 */
export function resolveCandidateGroup(candidates, resolver, fromFile, language) {
    for (const cand of candidates) {
        const outcome = resolver.classify(cand, fromFile, language);
        if (outcome.kind === 'resolved')
            return outcome.owner;
        if (outcome.kind === 'ambiguous')
            return undefined; // present-but-ambiguous → silence the group
        // outcome.kind === 'absent' → continue to the next, farther candidate
    }
    return undefined; // end of list, nothing bound → silence (external / unmapped)
}
/**
 * Resolve every detected reference of ONE file through {@link resolveCandidateGroup} and
 * return the bound edges, each `(line, owner)` at most once. Several references on one
 * line often bind to the same owner (a Python `from m import a, b` offers the module and each
 * name as candidates that all land in one file; a C# line names one type twice); they are one
 * dependency, so they are reported once. Shared by the live pass and the reference-case runner
 * so the two report the same rows.
 */
export function resolveDetectedEdges(detected, resolver, fromFile, language) {
    const out = [];
    const seen = new Set();
    for (const dep of detected) {
        const owner = resolveCandidateGroup(dep.candidates, resolver, fromFile, language);
        if (owner === undefined)
            continue;
        const key = `${dep.line}\0${owner}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ line: dep.line, owner });
    }
    return out;
}
/**
 * The candidate symbol keys for ONE dotted symbol reference: the verbatim dot-only key,
 * PLUS the guarded nested-type `+`-boundary splits. For a dotted candidate `s1...sn`, for
 * each split index `k` in `[1, n-1]` the key `s1..sk + '+' + s_{k+1}..sn` is added ONLY
 * when `s1..sk` is itself a declared TYPE in the table (`SymbolTable.has`, ≥1 def). This is
 * the language's true semantics — under a type you can only nest a type, never a namespace —
 * so splitting at a declared-type boundary recovers the real nested-type meaning (`Outer.Inner`
 * → the `Outer+Inner` declaration key), and never splitting at a namespace boundary keeps it
 * sound. A key with no `.` (already a bare or `+` key) has no split. Separator isolation: the
 * `+` keys live in a string space disjoint from the dot-only namespace candidates.
 */
function nestedSplitKeys(symbolTable, language, symbolKey) {
    const keys = [symbolKey];
    const segs = symbolKey.split('.');
    for (let k = 1; k < segs.length; k++) {
        const prefix = segs.slice(0, k).join('.');
        if (!symbolTable.has(language, prefix))
            continue; // guard: split only at a declared TYPE
        keys.push(`${prefix}+${segs.slice(k).join('+')}`);
    }
    return keys;
}
/**
 * The guarded nested-type `+`-split keys ONLY (the verbatim dotted form excluded). This is the
 * R4 reading: a `using A;` prefix on a multi-segment ref `B.Type` may bind `A.B+Type` (B a type,
 * Type nested) but MUST NOT bind the dotted `A.B.Type` (which would mean B is a sub-namespace,
 * and `using A;` imports the types of EXACTLY A, never A's nested namespaces). A single-segment
 * key (no `.`) has no split → empty.
 */
function nestedOnlySplitKeys(symbolTable, language, symbolKey) {
    const keys = [];
    const segs = symbolKey.split('.');
    for (let k = 1; k < segs.length; k++) {
        const prefix = segs.slice(0, k).join('.');
        if (!symbolTable.has(language, prefix))
            continue; // guard: split only at a declared TYPE
        keys.push(`${prefix}+${segs.slice(k).join('+')}`);
    }
    return keys;
}
/**
 * Ruby root-anchoring guard. A Ruby constant reference `A::B::C` resolves to an in-repo
 * declaration ONLY when its ROOT segment `A` is itself a declared in-repo symbol. Ruby's
 * COMPACT declaration form (`module Rackup::Handler`) records the full `Rackup::Handler`
 * key but REOPENS a namespace (`Rackup`) that must already exist — so when `Rackup` has no
 * in-repo declaration of its own, it is an EXTERNAL library and the compact form merely
 * extends it. A reference to `Rackup::Handler` then means the external entity, and binding
 * it to the in-repo reopening would be a FALSE POSITIVE (the real case: a test stub `module
 * Rackup::Handler` wrongly pulled in by a library file's `defined?(Rackup::Handler)`).
 * Requiring the root to be anchored in-repo (some bare `module Rackup` / `class Rackup`,
 * recorded as a single-segment key) keeps genuine in-repo constants resolvable while
 * silencing reopened-external ones. RUBY-ONLY: C#/Kotlin root at a namespace that is never
 * recorded as a standalone symbol, so this guard must not apply to them.
 */
function rubyRootUnanchored(symbolKey, symbolTable) {
    const idx = symbolKey.indexOf('::');
    if (idx === -1)
        return false; // single-segment reference: it is its own root
    return !symbolTable.has('ruby', symbolKey.slice(0, idx));
}
/**
 * Ruby's symbol-axis gates, applied before and after the distinct-file count. Returns the
 * forced outcome, or undefined to let the ordinary count decide.
 *  - A reference rooted at a core class or a ubiquitous framework namespace (see
 *    `isRubyExternalConstant`) is external → absent, whatever the repo reopens (a reopening
 *    is not a definition). An unanchored root is absent too (rubyRootUnanchored).
 *  - `rubyAnchor`: the candidate has no definition but its first-segment name does → Ruby
 *    stops there → ambiguous (silence the group, never fall through).
 *  - `rubyInheritGuard`: the top-level fallback binds, but a constant of the same first
 *    segment is nested in some in-repo namespace and could be inherited → ambiguous.
 */
function rubyGate(hint, files, symbolTable) {
    if (files === undefined) {
        if (isRubyExternalConstant(hint.symbolKey))
            return 'absent';
        if (rubyRootUnanchored(hint.symbolKey, symbolTable))
            return 'absent';
        return undefined;
    }
    if (files.size === 0) {
        return hint.rubyAnchor !== undefined && symbolTable.has('ruby', hint.rubyAnchor) ? 'ambiguous' : undefined;
    }
    // >= 1, not === 1: several defining files of ONE owner now bind too (owner ambiguity), and
    // the inheritance hazard is the same however many files that owner spreads the constant over.
    if (files.size >= 1 && hint.rubyInheritGuard !== undefined && symbolTable.hasNestedTail('ruby', hint.rubyInheritGuard)) {
        return 'ambiguous';
    }
    return undefined;
}
/** The languages that share the one JVM namespace (see symbol-table.ts). */
const JVM_LANGUAGES = new Set(['java', 'kotlin']);
/**
 * The "declarations incomplete" markers a Kotlin file declares when part of it could not be
 * parsed (kotlin.ts): `<package>.*` — the file may declare anything in its package — and
 * `<package>.<Type>+*` — the file declares `Type` but some of its members were unreadable.
 * A marker never names a real symbol, so it never creates a binding. It only keeps an
 * ambiguity the unreadable declarations might have created: when a binding key `k` has a
 * definer, every marker that could cover `k` contributes its file, and a marker file other
 * than the definer makes the lookup ambiguous (fail closed).
 *
 * Only the binding key's OWN package can be covered: a file of package `a` cannot declare
 * `a.b.C` as a top-level member, and declaring it as `a.b+C` (a type `b` nesting `C`) while a
 * package `a.b` exists is a JVM class/package clash, so a marker of an enclosing package never
 * covers a sub-package key.
 */
function incompletenessMarkers(bindingKey) {
    const plus = bindingKey.indexOf('+');
    const typePart = plus === -1 ? bindingKey : bindingKey.slice(0, plus);
    const dot = typePart.lastIndexOf('.');
    const markers = [dot === -1 ? '*' : `${typePart.slice(0, dot)}.*`];
    if (plus !== -1)
        markers.push(`${typePart}+*`);
    return markers;
}
/**
 * The C# reference filter: the definers a file can see. A definer in a project the file's project cannot reach is dropped (the compiler never binds it), and so is a definer in a reachable project whose declarations of the name are all internal to its assembly (`assemblyOnly`), unless that project names the caller's as a friend; when `preferOwn` and a definer lies in the file's own project, only those stay, because a type of the compilation wins over a type of the same name in a referenced assembly (warning CS0436, not an ambiguity). Extension methods are not types: they are not given that preference.
 */
function withinReach(files, fromFile, reach, preferOwn, assemblyOnly) {
    const seen = new Map();
    for (const f of files) {
        const r = reach(fromFile, f);
        if (r === 'unreachable')
            continue;
        if (r === 'reachable' && reach.internalsVisible !== undefined && assemblyOnly(f) && !reach.internalsVisible(fromFile, f))
            continue;
        seen.set(f, r);
    }
    const same = preferOwn ? [...seen].filter(([, r]) => r === 'same').map(([f]) => f) : [];
    return new Set(same.length > 0 ? same : seen.keys());
}
export function makeResolver(deps) {
    /** The DISTINCT defining files a dotted symbol candidate maps to, across the verbatim key
     *  AND the guarded nested-type `+`-splits. The set-level rule: 0 distinct files → absent,
     *  exactly 1 → that file, ≥2 → ambiguous (silence). Counting every defining file (not the
     *  unique-or-undefined per-key result) keeps a genuine ambiguity — a single key with two
     *  defs, OR two plausible splits resolving to different files — as ≥2 distinct files, so the
     *  group silences rather than leaking to a farther candidate. */
    const symbolFiles = (language, symbolKey) => {
        const files = new Set();
        for (const key of nestedSplitKeys(deps.symbolTable, language, symbolKey)) {
            for (const f of deps.symbolTable.filesFor(language, key))
                files.add(f);
        }
        return files;
    };
    /** What the resolver has read from the table for C#, kept while the table has taken no declaration since: the same few names are read through every using directive of every file, and each answer is the same each time. The C# type lookup (`csharp`) and the answers to C# conditions (`holds`) are kept the same way and renewed with the rest. */
    const kept = { at: -1, declared: new Map(), shadowSeen: new Map(), files: new Map(), plain: new Map(), nestedOnly: new Map(), within: new Map() };
    const keepFresh = () => {
        const declarations = declarationCount(deps.symbolTable);
        if (declarations === kept.at)
            return;
        kept.at = declarations;
        kept.declared.clear();
        kept.shadowSeen.clear();
        kept.files.clear();
        kept.plain.clear();
        kept.nestedOnly.clear();
        kept.within.clear();
        csharpLookup = undefined;
        held = new WeakMap();
    };
    /** The files that declare a key, as `SymbolTable.filesFor` gives them; a C# key's are kept (see `kept`), the same list read again and again and never changed by a reader. */
    const filesOf = (language, key) => {
        if (language !== 'csharp')
            return deps.symbolTable.filesFor(language, key);
        keepFresh();
        let files = kept.files.get(key);
        if (files === undefined)
            kept.files.set(key, (files = deps.symbolTable.filesFor(language, key)));
        return files;
    };
    /** True when the repository declares one of `shadow`'s names, as a type or as a namespace a key lies in: a nearer name C#'s lookup stops at, so a reading behind it binds nothing. */
    const shadowed = (language, shadow, fromFile) => {
        if (shadow === undefined)
            return false;
        if (language !== 'csharp')
            return shadow.some((name) => deps.symbolTable.has(language, name) || deps.symbolTable.hasNamespace(language, name));
        keepFresh();
        return shadow.some((name) => {
            let declared = kept.declared.get(name);
            if (declared === undefined)
                kept.declared.set(name, (declared = deps.symbolTable.has(language, name) || deps.symbolTable.hasNamespace(language, name)));
            if (!declared || fromFile === undefined || deps.reach === undefined)
                return declared;
            // Where the reference graph says what `fromFile` sees, a name only a project out of its reach declares is no name there: the compiler never reads it. The answer depends on the calling file, so it is kept by name and file.
            const asked = `${name}\0${fromFile}`;
            let seen = kept.shadowSeen.get(asked);
            if (seen === undefined) {
                const reach = deps.reach;
                const visible = (file) => reach(fromFile, file) !== 'unreachable';
                kept.shadowSeen.set(asked, (seen = deps.symbolTable.filesFor(language, name).some(visible) || (deps.symbolTable.hasNamespace(language, name) && deps.symbolTable.hasNamespace(language, name, visible))));
            }
            return seen;
        });
    };
    /**
     * The keys one C# reading may bind. A reading inside a type (`within`) is the nested type of that type or of its base classes, each name of a dotted reading read in what the name before it gave; `fromFile` says whose a `file` type is. Any other reading is the key as written, unless `nestedOnly`, and for each dot that follows a declared type the nested type the rest names there, inherited ones included (`Derived.Options` is the `Options` its base class declares).
     */
    const csharpKeys = (key, nestedOnly, within, fromFile) => {
        if (within !== undefined)
            return csharp().path(within, key.slice(referencedTypeKey(within).length + 1).split('.'), fromFile);
        const keys = nestedOnly ? [] : [key];
        const segs = key.split('.');
        for (let k = 1; k < segs.length; k++) {
            const prefix = segs.slice(0, k).join('.');
            if (deps.symbolTable.has('csharp', prefix))
                keys.push(...csharp().path(prefix, segs.slice(k)));
        }
        return keys;
    };
    /** How many answers are being worked out around the code that runs now. An answer worked out inside another may have read a base list that was still being bound (a type that names itself through its own bases, directly or through a type it nests), so it is not kept; the type lookup binds base lists on its own, outside any reading, and counts the same. */
    let working = 0;
    const whileWorking = (work) => {
        working++;
        try {
            return work();
        }
        finally {
            working--;
        }
    };
    /** The C# keys of one reading (see `memberKeys`), kept (see `kept`) when no other answer is being worked out. `fromFile` takes part only for a reading inside a type, the one reading it changes. */
    const csharpMemberKeys = (key, nestedOnly, shadow, within, fromFile) => {
        keepFresh();
        // A reading behind a nearer namespace or type the lookup stops at binds nothing.
        if (shadowed('csharp', shadow, fromFile))
            return [];
        const keptKeys = within !== undefined ? kept.within : nestedOnly ? kept.nestedOnly : kept.plain;
        const asked = within !== undefined ? `${key}\0${within}\0${fromFile ?? ''}` : key;
        const known = keptKeys.get(asked);
        if (known !== undefined)
            return known;
        const outermost = working === 0;
        const keys = whileWorking(() => csharpKeys(key, nestedOnly, within, fromFile));
        if (outermost)
            keptKeys.set(asked, keys);
        return keys;
    };
    /** The declared keys one symbol-set member reads, honoring `nestedOnly` (R4): a
     *  `nestedOnly` member reads ONLY its guarded `+`-split keys, never the verbatim
     *  dotted reading. A plain member reads the verbatim key + all guarded splits. */
    const memberKeys = (language, key, nestedOnly, shadow, within, fromFile) => {
        if (language === 'csharp')
            return csharpMemberKeys(key, nestedOnly, shadow, within, fromFile);
        // A reading behind a nearer namespace or type the lookup stops at binds nothing.
        if (shadowed(language, shadow, fromFile))
            return [];
        return nestedOnly ? nestedOnlySplitKeys(deps.symbolTable, language, key) : nestedSplitKeys(deps.symbolTable, language, key);
    };
    /** True when the declaration `file` gives of `key` is internal to its assembly: the file marks it so (the extractor's `internal:<key>` marker beside it), or, for a type, a file of the same compilation marks the type or a type around it. The parts of a partial type are one type with one accessibility (C# spec §15.2.7), so a part without an access modifier, which its own file cannot mark, takes what another part of its compilation says. An extension method's key names every method of that name in its namespace, each with its own modifier, so only its own file speaks for it. */
    const internalIn = (language, key, file) => {
        if (filesOf(language, internalKey(key)).includes(file))
            return true;
        if (key.endsWith('()'))
            return false;
        for (let end = key.length; end !== -1; end = key.lastIndexOf('+', end - 1)) {
            if (filesOf(language, internalKey(key.slice(0, end))).some((part) => part !== file && deps.reach?.(file, part) === 'same'))
                return true;
        }
        return false;
    };
    /** The shapes `file` records for the extension keys among `keys` (`shapes:<key>`), led by `-` for a method only its assembly sees and by `~` for a private one; empty when it records none. */
    const extensionShapesIn = (keys, file) => {
        const out = [];
        for (const k of keys)
            if (k.endsWith('()'))
                out.push(...(csharp().extensionShapes(k).get(file) ?? []));
        return out;
    };
    /** True when every declaration `file` gives of `keys` is internal to its assembly (`internalIn`). A file that declares extension methods of the name is judged by the shape of each (a shape led by `-` or `~`), as one file may hold a public and an internal method of one name. */
    const assemblyOnlyIn = (language, keys, file) => {
        const shapes = language === 'csharp' ? extensionShapesIn(keys, file) : [];
        if (shapes.length > 0)
            return shapes.every((shape) => shape.startsWith('-') || shape.startsWith('~'));
        return keys.every((k) => !filesOf(language, k).includes(file) || internalIn(language, k, file));
    };
    /** True when every extension method `file` declares under `keys` is private to its static class: only that file's own calls see it. */
    const privateOnlyIn = (keys, file) => {
        const shapes = extensionShapesIn(keys, file);
        return shapes.length > 0 && shapes.every((shape) => shape.startsWith('~'));
    };
    /** Every key a symbol hint reads: those of each member of its set, or its own. */
    const hintKeys = (hint, language, fromFile) => hint.set !== undefined
        ? hint.set.flatMap((m) => memberKeys(language, m.symbolKey, m.nestedOnly === true, m.shadow, undefined, fromFile))
        : memberKeys(language, hint.symbolKey, hint.nestedOnly === true, hint.shadow, hint.within, fromFile);
    /** The distinct files a symbol HINT maps to: the union across its `set` members (each honoring
     *  its own `nestedOnly`) when a set is present, else the single `symbolKey` honoring the hint's
     *  own `nestedOnly`. ≥2 distinct files anywhere = a real ambiguity (CS0104 / co-definition). */
    const hintFiles = (hint, language, fromFile) => {
        if (hint.attribute !== undefined)
            return attributeBinding(hint.attribute, fromFile)?.files ?? new Set();
        // A reading one of whose conditions holds binds nothing.
        if (hint.unless !== undefined && hint.unless.some((condition) => holds(condition, fromFile)))
            return new Set();
        const keys = hintKeys(hint, language, fromFile);
        const files = new Set();
        for (const k of keys) {
            for (const f of filesOf(language, k))
                files.add(f);
        }
        const extension = hint.symbolKey.endsWith('()');
        if (language !== 'csharp' || (deps.reach === undefined && !extension))
            return files;
        // A private extension method is no definer for a call outside the file that declares it, whatever the assembly says.
        if (extension)
            for (const f of [...files])
                if (f !== fromFile && privateOnlyIn(keys, f))
                    files.delete(f);
        if (deps.reach === undefined)
            return byReceiver(hint, files, keys, fromFile);
        if (hint.set === undefined && hint.nestedOnly !== true && !shadowed(language, hint.shadow, fromFile) && (hint.symbolKey === 'Program' || hint.symbolKey === IMPLICIT_PROGRAM_KEY)) {
            // The global `Program` of C#: a declared `public partial class Program { }` and the class the compiler makes of top-level statements are one name to it. Where the reference graph says what the caller sees, the two are chosen among together (an explicit class in a project out of reach must not outrank the implicit one in reach, and two referenced projects with a `Program` each are the compiler's CS0433, not a binding for the declared one). Where it can say nothing for some definer, the order stays what it was without a graph: the declared class first, the implicit one only as the fallback.
            const both = new Set([...filesOf(language, 'Program'), ...filesOf(language, IMPLICIT_PROGRAM_KEY)]);
            if (![...both].some((f) => deps.reach?.(fromFile, f) === 'unknown'))
                return withinReach(both, fromFile, deps.reach, true, (f) => assemblyOnlyIn(language, ['Program', IMPLICIT_PROGRAM_KEY], f));
        }
        // An extension-method key (`<ns>.<Name>()`) is chosen among by overload resolution, not by the compilation's own-type preference: a definer in another project may be the better overload, so every definer in reach stays.
        return byReceiver(hint, withinReach(files, fromFile, deps.reach, !extension, (f) => assemblyOnlyIn(language, keys, f)), keys, fromFile);
    };
    /**
     * The definers of an extension-method reading that can take the call when its receiver's type is written (`TargetHint.takes.receiver`) and the reading names more than one file: those with a method, as far as the calling file sees it, that takes the call's counts and whose `this` parameter does not refuse a value of the receiver's type for certain (the type itself, one it derives from or implements, or a type the records say nothing about). A definer that records no shape takes any call. The files are left as they are when the receiver's type binds no one type of the repository.
     */
    const byReceiver = (hint, files, keys, fromFile) => {
        const takes = hint.takes;
        if (takes?.receiver === undefined || files.size < 2)
            return files;
        const receiver = bindCsharpType(takes.receiver, fromFile)?.key;
        if (receiver === undefined)
            return files;
        const kept = new Set();
        for (const file of files) {
            let recorded = false;
            let takesIt = false;
            for (const key of new Set(keys)) {
                const shapes = csharp().extensionShapes(key).get(file);
                if (shapes === undefined)
                    continue;
                recorded = true;
                const seen = deps.reach?.(fromFile, file);
                const friend = seen !== 'reachable' || deps.reach?.internalsVisible === undefined || deps.reach.internalsVisible(fromFile, file);
                for (const shape of shapes) {
                    const seesIt = shape.startsWith('~') ? file === fromFile : shape.startsWith('-') ? friend : true;
                    if (!seesIt)
                        continue;
                    const [counts, written] = (shape.startsWith('~') || shape.startsWith('-') ? shape.slice(1) : shape).split('|');
                    if (shapeTakes(counts, takes.typeArgs, takes.args) && (written === undefined || !csharp().cannotTakeReceiver(written, receiver, key, file)))
                        takesIt = true;
                }
            }
            if (!recorded || takesIt)
                kept.add(file);
        }
        return kept;
    };
    /**
     * Whether the owner a C# extension-method reading binds can take its call (`TargetHint.takes`). The shapes are read from the `shapes:<key>` records themselves: every record of a key of the reading whose file is one of `files` or belongs to the owner of one of them. A consumer may hand the table one file per owner for a name key and still hands it every record, so the method that takes the call may sit in a file the name key does not list. Such a file counts only as far as the calling file sees it, as the reach filter reads a definer: a file of a project out of reach has no say, and neither has a method only its own assembly sees (a shape led by `-`) for a caller of another compilation that is no friend, and a private one (a shape led by `~`) for a caller in any other file. True when one of the shapes left takes the call's counts, or when one of `files` has no record at all (a definer without one takes any call). It is asked only of a reading that would bind: a reading whose owner cannot take the call binds nothing, as a name the repository does not declare, and the walk goes on to the next reading, as C# goes on to the next namespace. A reading that names two owners and carries no written receiver type stays ambiguous whatever their shapes, for the counts choose no one among several; with one, `byReceiver` has already narrowed the owners by the receiver's type before this is asked.
     */
    const takesCall = (hint, files, language, fromFile) => {
        const takes = hint.takes;
        if (takes === undefined || language !== 'csharp')
            return true;
        const owners = new Set();
        for (const f of files) {
            const owner = deps.ownerIndex.ownerOf(f);
            if (owner !== undefined)
                owners.add(owner);
        }
        const recorded = new Set();
        for (const key of new Set(hintKeys(hint, language, fromFile))) {
            for (const [file, shapes] of csharp().extensionShapes(key)) {
                const owner = files.has(file) ? undefined : deps.ownerIndex.ownerOf(file);
                if (!files.has(file) && (owner === undefined || !owners.has(owner)))
                    continue;
                const seen = deps.reach?.(fromFile, file);
                if (seen === 'unreachable')
                    continue;
                const friend = seen !== 'reachable' || deps.reach?.internalsVisible === undefined || deps.reach.internalsVisible(fromFile, file);
                if (shapes.some((shape) => (shape.startsWith('~') ? file === fromFile && shapeTakes(shape.slice(1), takes.typeArgs, takes.args) : shape.startsWith('-') ? friend && shapeTakes(shape.slice(1), takes.typeArgs, takes.args) : shapeTakes(shape, takes.typeArgs, takes.args))))
                    return true;
                recorded.add(file);
            }
        }
        return [...files].some((f) => !recorded.has(f));
    };
    /** The one C# type an ordered group of readings binds for `fromFile`, with the files in reach that declare it: that of the first reading some file in reach declares, or undefined when no reading binds or that reading names more than one type. */
    const bindCsharpType = (readings, fromFile) => {
        for (const hint of readings) {
            if (hint.kind !== 'symbol')
                continue;
            const files = hintFiles(hint, 'csharp', fromFile);
            if (files.size === 0)
                continue;
            const keys = [...new Set(hintKeys(hint, 'csharp', fromFile))].filter((k) => filesOf('csharp', k).some((f) => files.has(f)));
            return keys.length === 1 ? { key: keys[0], files: new Set(filesOf('csharp', keys[0]).filter((f) => files.has(f))) } : undefined;
        }
        return undefined;
    };
    let csharpLookup;
    const csharp = () => {
        keepFresh();
        return (csharpLookup ??= makeCsharpTypeLookup(deps.symbolTable, (readings, fromFile) => whileWorking(() => bindCsharpType(readings, fromFile)?.key), (readings, fromFile) => whileWorking(() => readings.some((hint) => hintFiles(hint, 'csharp', fromFile).size > 0))));
    };
    /** Whether a C# condition holds for a reading of `fromFile` (see `CsharpCondition`); asked once per condition and file while the table takes no declaration, however many readings carry it. */
    let held = new WeakMap();
    const holds = (condition, fromFile) => {
        keepFresh();
        let byFile = held.get(condition);
        if (byFile === undefined)
            held.set(condition, (byFile = new Map()));
        let answer = byFile.get(fromFile);
        if (answer === undefined) {
            answer = conditionHolds(condition, fromFile);
            byFile.set(fromFile, answer);
        }
        return answer;
    };
    const conditionHolds = (condition, fromFile) => {
        if (condition.kind === 'instance-method') {
            return (condition.self !== undefined && csharp().hasMethod(condition.self, condition, condition.from, fromFile))
                || condition.receivers.some((readings) => {
                    const bound = bindCsharpType(readings, fromFile);
                    return bound !== undefined && csharp().hasMethod(bound.key, condition, condition.from, fromFile);
                })
                || (condition.fileReceivers ?? []).some(({ readings, type }) => {
                    // A nearer reading that names a declaration decides; else the receiver is the `file` type of the referencing file.
                    const nearer = readings.some((hint) => hint.kind === 'symbol' && hintFiles(hint, 'csharp', fromFile).size > 0);
                    const key = nearer ? bindCsharpType(readings, fromFile)?.key : type;
                    return key !== undefined && csharp().hasMethod(key, condition, condition.from, fromFile);
                });
        }
        // The nearest type around the name that knows it decides what the name is there.
        for (const type of condition.types) {
            const found = csharp().simpleName(type, condition.name, fromFile);
            if (found === 'none')
                continue;
            if (condition.kind === 'member')
                return found === 'member';
            // A nested type of that name: the call is a static call through it, unless the receiver is written `this.<name>`, which names no type.
            if (found === 'type')
                return condition.own !== true;
            // A member: a value, whose written type may have the called method itself.
            const call = condition.call;
            return call !== undefined && csharp().memberTypes(type, condition.name, fromFile).some((key) => csharp().hasMethod(key, call, call.from, fromFile));
        }
        return condition.kind === 'no-member' && condition.own !== true;
    };
    /** The type an attribute names (see `TargetHint.attribute`): each reading bound by itself, and the one C# takes among them (`attributeReading`). */
    const attributeBinding = (attribute, fromFile) => {
        const written = bindCsharpType(attribute.written, fromFile);
        const suffixed = attribute.suffixed === undefined ? undefined : bindCsharpType(attribute.suffixed, fromFile);
        const taken = attributeReading(written && csharp().attributeClass(written.key), suffixed && csharp().attributeClass(suffixed.key), attribute.suffixed !== undefined);
        return taken === 'written' ? written : taken === 'suffixed' ? suffixed : undefined;
    };
    /**
     * One dotted JVM symbol (a Kotlin import, a Java or Kotlin inline FQN type, or a Java import
     * the source-root probe missed) in the shared JVM namespace: the verbatim key plus its guarded
     * `+`-splits, counted by OWNER like the generic symbol axis (see symbolOutcome):
     * 0 files → none; 1 file, or 2+ files that all belong to ONE owner (Kotlin expect/actual,
     * top-level overloads spread over files) → that file (the lexicographically first); 2+ owners,
     * or 2+ files including an unmapped one → ambiguous. Then the incompleteness markers: a marker
     * file other than the definers that could cover a binding key makes the lookup ambiguous (fail
     * closed) — UNLESS it belongs to the same owner as the definers, because an unreadable
     * declaration in that owner can only name that owner again and can never flip the edge.
     */
    const jvmSymbolOutcome = (language, symbolKey, visibleFrom) => {
        // A same-package hint (`visibleFrom` is the referencing file) sees only the definers its source set can see.
        const visible = (f) => visibleFrom === undefined || jvmSourceSetVisible(visibleFrom, f);
        const keys = nestedSplitKeys(deps.symbolTable, language, symbolKey);
        const files = new Set();
        const bindingKeys = [];
        for (const key of keys) {
            const defs = deps.symbolTable.filesFor(language, key).filter(visible);
            if (defs.length > 0)
                bindingKeys.push(key);
            for (const f of defs)
                files.add(f);
        }
        if (files.size === 0)
            return { kind: 'none' };
        const sorted = [...files].sort();
        // The owner every definer shares; undefined for a lone unmapped definer (then any other
        // marker file is ambiguous, exactly as before owner collapse).
        const owner = deps.ownerIndex.ownerOf(sorted[0]);
        if (sorted.length >= 2) {
            if (owner === undefined || sorted.some((f) => deps.ownerIndex.ownerOf(f) !== owner))
                return { kind: 'ambiguous' };
        }
        for (const key of bindingKeys) {
            for (const marker of incompletenessMarkers(key)) {
                for (const f of deps.symbolTable.filesFor(language, marker)) {
                    if (files.has(f) || !visible(f))
                        continue;
                    if (owner === undefined || deps.ownerIndex.ownerOf(f) !== owner)
                        return { kind: 'ambiguous' };
                }
            }
        }
        return { kind: 'file', file: sorted[0] };
    };
    /**
     * A star / on-demand import of `prefix` (Kotlin `import a.b.*`, a Java `import a.b.*;` whose
     * package directory the source-root probe did not find): every file declaring a direct
     * top-level member of package `prefix`, plus the declaring file of a CLASSIFIER named `prefix`
     * (a star import of an enum's entries or an object's members), collapsed by owner exactly like
     * Java's on-disk wildcard: one owner → one of its files; two or more owners → ambiguous;
     * no owner at all → a file anyway (so `resolveFile` can still see a target another grouping covers; the
     * ownership step turns it into `absent`), or none when nothing in-repository declares into it.
     */
    const jvmStarOutcome = (language, prefix) => {
        const files = new Set(deps.symbolTable.filesInPackage(language, prefix));
        for (const f of symbolFiles(language, prefix))
            files.add(f);
        if (files.size === 0)
            return { kind: 'none' };
        const sorted = [...files].sort();
        let sole;
        for (const f of sorted) {
            const owner = deps.ownerIndex.ownerOf(f);
            if (owner === undefined)
                continue;
            if (sole === undefined)
                sole = owner;
            else if (owner !== sole)
                return { kind: 'ambiguous' };
        }
        if (sole === undefined)
            return { kind: 'file', file: sorted[0] };
        return { kind: 'file', file: sorted.find((f) => deps.ownerIndex.ownerOf(f) === sole) };
    };
    /** The JVM route for a hint, or undefined when the hint is not a JVM hint this route owns: a
     *  Kotlin star import (`<prefix>.*`), any plain JVM symbol hint, or — only after the Java
     *  source-root probe returned nothing (`pathMissed`) — a Java import resolved through the
     *  shared JVM namespace (cross-module, test → main, Java → Kotlin class or file facade). */
    const jvmOutcome = (hint, language, pathMissed, fromFile) => {
        if (!JVM_LANGUAGES.has(language))
            return undefined;
        if (hint.kind === 'symbol') {
            if (hint.set !== undefined || hint.nestedOnly === true)
                return undefined;
            if (language === 'kotlin' && hint.symbolKey.endsWith('.*')) {
                return jvmStarOutcome(language, hint.symbolKey.slice(0, -2));
            }
            return jvmSymbolOutcome(language, hint.symbolKey, hint.samePackage === true ? fromFile : undefined);
        }
        if (language !== 'java' || !pathMissed)
            return undefined;
        return hint.isPackage === true
            ? jvmStarOutcome(language, hint.specifier)
            : jvmSymbolOutcome(language, hint.specifier);
    };
    const classifyJvm = (outcome) => {
        if (outcome.kind === 'ambiguous')
            return { kind: 'ambiguous' };
        if (outcome.kind === 'none')
            return { kind: 'absent' };
        const owner = deps.ownerIndex.ownerOf(outcome.file);
        return owner ? { kind: 'resolved', owner, resolvedFile: outcome.file } : { kind: 'absent' };
    };
    /**
     * The symbol-axis outcome for a hint's distinct defining files, counted by OWNER:
     * one file → that file (mapped or not, as before); 2+ files that ALL belong to the same owner
     * → that owner, reported with the lexicographically first file; 2+ files spanning 2+ owners,
     * or including any unmapped file → ambiguous. Language-agnostic: C# partial classes and the
     * `Result` / `Result<T>` split, Kotlin expect/actual and overloads spread over files, and any
     * other declaration split across files of ONE owner name exactly one dependency target — the
     * ambiguity that must silence is between OWNERS, never between files of one owner.
     */
    const symbolOutcome = (files) => {
        if (files.size === 0)
            return { kind: 'absent' };
        const sorted = [...files].sort();
        if (sorted.length === 1) {
            const owner = deps.ownerIndex.ownerOf(sorted[0]);
            // Resolved-but-UNMAPPED is the non-event of an unowned target → absent (continue), never ambiguous.
            return owner ? { kind: 'resolved', owner, resolvedFile: sorted[0] } : { kind: 'absent' };
        }
        const owners = new Set(sorted.map((f) => deps.ownerIndex.ownerOf(f)));
        if (owners.size !== 1 || owners.has(undefined))
            return { kind: 'ambiguous' };
        return { kind: 'resolved', owner: [...owners][0], resolvedFile: sorted[0] };
    };
    const resolve = (hint, fromFile, language) => {
        const jvmFirst = hint.kind === 'symbol' ? jvmOutcome(hint, language, false, fromFile) : undefined;
        if (jvmFirst !== undefined) {
            const c = classifyJvm(jvmFirst);
            return c.kind === 'resolved' ? { owner: c.owner, resolvedFile: c.resolvedFile } : undefined;
        }
        if (hint.kind === 'symbol') {
            if (language === 'ruby' && rubyGate(hint, undefined, deps.symbolTable) !== undefined)
                return undefined;
            const files = hintFiles(hint, language, fromFile);
            if (language === 'ruby' && rubyGate(hint, files, deps.symbolTable) !== undefined)
                return undefined;
            const outcome = symbolOutcome(files);
            // absent / ambiguous (2+ owners) → silence; resolved (one file, or one owner) → edge.
            return outcome.kind === 'resolved' && takesCall(hint, files, language, fromFile) ? { owner: outcome.owner, resolvedFile: outcome.resolvedFile } : undefined;
        }
        const file = deps.resolvePathToFile(hint.specifier, fromFile, language, hint.isPackage, deps.symbolTable, hint.callForm);
        if (!file) {
            const fallback = jvmOutcome(hint, language, true, fromFile);
            if (fallback === undefined)
                return undefined; // unresolved → silence
            const c = classifyJvm(fallback);
            return c.kind === 'resolved' ? { owner: c.owner, resolvedFile: c.resolvedFile } : undefined;
        }
        const owner = deps.ownerIndex.ownerOf(file);
        if (!owner)
            return undefined; // UNMAPPED target → coverage matter, never a violation (an unowned target is a non-event)
        return { owner, resolvedFile: file };
    };
    const classify = (hint, fromFile, language) => {
        const jvmFirst = hint.kind === 'symbol' ? jvmOutcome(hint, language, false, fromFile) : undefined;
        if (jvmFirst !== undefined)
            return classifyJvm(jvmFirst);
        if (hint.kind === 'symbol') {
            // Ruby: a multi-segment constant whose ROOT namespace is not itself declared in-repo
            // is reopening an EXTERNAL library (e.g. a test stub `module Rackup::Handler`) → absent,
            // never bind a reference to the reopened-external constant (zero-FP). See rubyRootUnanchored.
            // Ruby also treats core classes and framework namespaces as external (a reopening is not
            // a definition) and applies the lexical gates below — see rubyGate.
            if (language === 'ruby') {
                const forced = rubyGate(hint, undefined, deps.symbolTable);
                if (forced !== undefined)
                    return { kind: forced };
            }
            // Symbol axis: collect the distinct files this hint maps to — the union across its `set`
            // members (CS0104 / co-definition), each honoring `nestedOnly` (R4), or the lone
            // `symbolKey`'s verbatim + guarded `+`-splits. Files spanning ≥2 owners is a real
            // ambiguity (silence the group); 0 is absent (continue); one file or one owner binds
            // (see symbolOutcome).
            const files = hintFiles(hint, language, fromFile);
            if (language === 'ruby') {
                const forced = rubyGate(hint, files, deps.symbolTable);
                if (forced !== undefined)
                    return { kind: forced };
            }
            const outcome = symbolOutcome(files);
            return outcome.kind === 'resolved' && !takesCall(hint, files, language, fromFile) ? { kind: 'absent' } : outcome;
        }
        // Path axis (PHP/Java/TS/JS/Py/Go/Rust/C/C++): resolution maps to AT MOST ONE file,
        // so the path probe itself has no `ambiguous` outcome — only resolved or absent. The one
        // exception is Java's miss fallback into the shared JVM namespace, where a duplicate
        // declaration or a split package IS an ambiguity.
        const file = deps.resolvePathToFile(hint.specifier, fromFile, language, hint.isPackage, deps.symbolTable, hint.callForm);
        if (!file) {
            const fallback = jvmOutcome(hint, language, true, fromFile);
            return fallback !== undefined ? classifyJvm(fallback) : { kind: 'absent' };
        }
        const owner = deps.ownerIndex.ownerOf(file);
        return owner ? { kind: 'resolved', owner, resolvedFile: file } : { kind: 'absent' };
    };
    const resolveFile = (hint, fromFile, language) => {
        const jvmFirst = hint.kind === 'symbol' ? jvmOutcome(hint, language, false, fromFile) : undefined;
        if (jvmFirst !== undefined)
            return jvmFirst.kind === 'file' ? jvmFirst.file : undefined;
        if (hint.kind === 'symbol') {
            if (language === 'ruby' && rubyGate(hint, undefined, deps.symbolTable) !== undefined)
                return undefined;
            const files = hintFiles(hint, language, fromFile);
            if (language === 'ruby' && rubyGate(hint, files, deps.symbolTable) !== undefined)
                return undefined;
            return files.size === 1 && takesCall(hint, files, language, fromFile) ? [...files][0] : undefined; // 0 → unresolved; ≥2 → ambiguous
        }
        const file = deps.resolvePathToFile(hint.specifier, fromFile, language, hint.isPackage, deps.symbolTable, hint.callForm);
        if (file)
            return file;
        const fallback = jvmOutcome(hint, language, true, fromFile);
        return fallback?.kind === 'file' ? fallback.file : undefined;
    };
    return { resolve, classify, resolveFile };
}
