import type { DependencyExtractor, DetectedDep, ParsedFile, TargetHint } from './types.mjs';
/**
 * The symbol key of the class the compiler synthesizes for a file of top-level statements. That class is the global `Program`, but it is published under this separate key so that it only ever acts as a FALLBACK: a bare `Program` reference tries every explicit reading first (the enclosing namespaces, the usings, and the verbatim global `Program`, which a `public partial class Program { }` declares) and reaches this key last. An explicit global `Program` anywhere therefore binds before any implicit one, and only when none is declared do the implicit classes count (one owner gives the edge, several give silence). A resolver given the reference graph (`ResolverDeps.reach`) reads the explicit and the implicit class as ONE name instead, as the compiler does, and chooses among those the referencing project can see, as long as the graph can say something about each of them. `<Program>$` is the name the compiler gave the class before C# 10; no C# source can write it, so no type key or use candidate other than that fallback can ever produce it.
 */
export declare const IMPLICIT_PROGRAM_KEY = "<Program>$";
/**
 * The marker key of a declaration only its own assembly sees: `internal:<key>`, declared beside `<key>` by the same file. A type whose effective accessibility stops at its assembly (`internal`, `private`, `private protected`, a top-level type with no access modifier, which C# makes internal, or a type nested in one of those), and an extension method that is not public or whose static class is not, carry it; a resolver given the reference graph drops such a definer for a caller of another compilation unless the defining project grants that caller its internals (`InternalsVisibleTo`). The colon puts the key in a string space no C# name can produce. A `partial` type part without an access modifier is not marked: another part may make it public.
 */
export declare function internalKey(symbolKey: string): string;
/**
 * The head of the key that records one base of the type `typeKey`: `base:<key>`. A type declaration with a base list declares, for each base it lists, the key `base:<key>\t<value>`, the value (`encodeWritten`) holding where the base's name is written and the name. The symbol table lists such a key under its head (`SymbolTable.valuesOf`) and never as a name, and every part of a partial type adds its own. The colon and the tab are in no C# name.
 */
export declare function baseListKey(typeKey: string): string;
/** The head of the key that records one base of a C#11 `file` type of the key `typeKey`: `file-base:<key>`, with a value like a base record's. Such a type has no published key and belongs to its file alone, so its bases are kept apart from those of a published type of the same name, and they are followed only while one file declares a `file` type of that key: two files may each declare an unrelated one, and a record does not say which of them a reader stands in. */
export declare function fileBaseListKey(typeKey: string): string;
/** The head of the key that records the using directives of a file: `usings`. A file that records a written type (`encodeWritten`) declares `usings\t<value>` once, the value (`encodeUsings`) holding what a name written in that file is read with, so each record holds a name and no reading of its own. */
export declare const USINGS_KEY = "usings";
/** The marker key of an interface: `interface:<key>`, declared beside the type key of every interface declaration. A class inherits the nested types of its base class and of no interface it implements, and the base list of a class does not say which of its names is which. */
export declare function interfaceKey(typeKey: string): string;
/** The head of the key that records the instance methods of the type `typeKey`: `methods:<key>`. A part of a type that declares any declares `methods:<key>\t<value>` once, the value (`decodeMethods`) listing each overload by name, shape (`methodShape`) and reach, listed under the head like a base record (`baseListKey`). A static method, an explicit interface implementation (callable through the interface alone) and an extension method are not listed, and a private method only in a `partial` type, whose other parts can call it. The colon is in no C# name. */
export declare function methodsKey(typeKey: string): string;
/** One instance method of a type as its record lists it: `reach` says who can call it, any code (`public`, which stands for `internal` and `protected internal` too: an assembly is not told apart here), the type and the types derived from it (`protected`), or the type alone (`private`). */
export interface CsharpMethod {
    name: string;
    shape: string;
    reach: 'public' | 'protected' | 'private';
}
/** The methods a `methods` record's value lists: entries `<mark><name>:<shape>` joined by a space, the mark `~` for a protected method and `-` for a private one. */
export declare function decodeMethods(value: string): CsharpMethod[];
/** True when a call with `typeArguments` written type arguments and `args` arguments can be a call of a method of the shape `shape` (`methodShape`): the counts fit. A call without type arguments fits a generic method too, whose type arguments the compiler infers. */
export declare function shapeTakes(shape: string, typeArguments: number, args: number): boolean;
/** The head of the key that records the members of the type `typeKey` that are no types: `members:<key>`. A part of a type declares `members:<key>\t<value>` once, the value (`decodeMembers`) listing each field, constant, property, event and method by name, static ones included, and the written type of a field or a property. C# reads the members of the types around a simple name, inherited ones included, before any namespace (spec §12.8.4), so such a name is that member and no type of a namespace. Only a type whose members code outside its declaration can read by a simple name lists them (`givesMembers`), a private member only in a `partial` type, and a field or a property named as its own type (`Color Color`) never: where a type fits, C# reads that name as the type (spec §12.8.7.2). */
export declare function membersKey(typeKey: string): string;
/** One member of a type as its record lists it: `hidden` for a private one (and for a primary constructor parameter of a class or a struct), which every part of the type sees and no derived type does; `type` the written type of a field or a property that names one (`CsharpWritten`). */
export interface CsharpMember {
    name: string;
    hidden: boolean;
    type?: CsharpWritten;
}
/** The members a `members` record's value lists: entries `<name>` or `<name>=<offset>:<type name>` joined by a space, a hidden one led by `-`. */
export declare function decodeMembers(value: string): CsharpMember[];
/** A type name as a record holds it: `at`, where the name is written in its file (which says which using directives of a namespace block reach it), and `name`, the name with its type arguments as their arity: `Base`, ``Repo`1``, `Lib.Base`, `global::Lib.Base` for a rooted one, `S::Thing` for one led by a using alias, and the empty string for a name that is no reference (a type parameter). */
export interface CsharpWritten {
    at: number;
    name: string;
}
/** The value of a record of a written type (see `baseListKey`). */
export declare function encodeWritten(written: CsharpWritten): string;
/** The written type a record's value holds (see `encodeWritten`). */
export declare function decodeWritten(value: string): CsharpWritten;
/** What a written type of a file is read with: the file's using scope, as far as the readings need it, and the keys of the types the file keeps to itself. */
export type CsharpUsings = Pick<CsharpExtract, 'scope' | 'fileLocalTypes'>;
/** The value of a file's `usings` record (see `USINGS_KEY`): the using directives the readings of a name depend on, an empty list left out. A directive of the compilation unit is its namespace or type alone; one in a namespace block keeps its block. */
export declare function encodeUsings({ scope, fileLocalTypes }: CsharpUsings): string;
/** The using scope a `usings` record's value holds (see `encodeUsings`). */
export declare function decodeUsings(value: string): CsharpUsings;
/**
 * The readings of a written type of a record, in C# lookup order where it is written: `holder` is the key of the type that writes it, in its base list or, with `inBody`, as the type of one of its members, and `usings` what its file reads names with. The namespaces and the types around the name are those of `holder` itself; the project's own scope (a global using of another file) takes no part.
 */
export declare function writtenReadings(written: CsharpWritten, holder: string, inBody: boolean, usings: CsharpUsings): SymbolHint[];
interface UsingScope {
    /** Namespace prefixes from plain `using Foo.Bar;` directives (file-local). */
    prefixes: string[];
    /** Namespace prefixes from `global using Foo.Bar;` declared in THIS file. Tracked apart
     *  from `prefixes` only so the cross-file pre-pass (the consumer's relation pass) can aggregate them project-
     *  wide; for THIS file's resolution they bind identically to a file-local plain using. */
    globalPrefixes: string[];
    /** alias local-name → aliased FQN from `using Alias = Foo.Bar;` (incl. `global using
     *  Alias = ...`, an alias is always file-local in effect for resolution). */
    aliases: Map<string, string>;
    /** alias local-name → aliased FQN from `global using Alias = Foo.Bar;` declared in THIS file
     *  only. Tracked apart from `aliases` so the cross-file pre-pass (the consumer's relation pass) can aggregate them
     *  project-wide (A12). The RHS FQN is the resolved alias target (C# resolves an alias RHS
     *  fully-qualified vs the global namespace, so the captured dotted text IS the target). */
    globalAliases: Map<string, string>;
    /** alias local-name → every directive of that name in the file, one per namespace body (the nearest enclosing body holding a use decides which one the use sees); for each, `fqn` is the target, `body` is the directive's enclosing-namespace chain (innermost first, empty in the compilation unit), the namespace body whose lookup the alias belongs to; `rooted` is a `global::` target, read from the global namespace only; `outer` are the using directives of the namespace declarations around that body (`outerUsings`), which take part in the lookup at their own namespace. A use of the alias and an `S::` rewrite read the target as the directive does and see the alias only from inside that body. */
    aliasDecls: Map<string, Array<{
        fqn: string;
        body: string[];
        rooted: boolean;
        outer: OuterUsings[];
        start: number;
        end: number;
    }>>;
    /** Every plain `using N;` directive of the file that is not a `global using`, in file order: `ns` the namespace as written (its `global::` qualifier stripped, and then `rooted`: such a namespace is read from the global namespace only), `body` the enclosing-namespace chain of the body that holds it (innermost first, empty in the compilation unit), `start`/`end` the text range of that body's block (`directiveBlock`). The directive imports its namespace for the references inside that range only, at the level of `body[0]`; inside a namespace body the namespace it names is read where it stands, nearest namespace first (C# spec §14.5.3). `prefixes` lists the same directives' namespaces without their place. */
    prefixDecls: Array<{
        ns: string;
        rooted: boolean;
        body: string[];
        start: number;
        end: number;
    }>;
    /** The written TARGET type (its `global::` qualifier stripped, with the directive's line) of each `using static N.C;` /
     *  `global using static N.C;` directive in this file (A8/A11). The directive names a concrete
     *  type whose static members are imported — that target is a real type dependency of this file,
     *  NOT a namespace prefix (a sibling `N.Baz` is never imported). The edge itself comes from the
     *  `target` descriptors the extract emits for the directive, which read the type where the directive stands. */
    staticTargets: Array<{
        fqn: string;
        line: number;
    }>;
    /** Every `using static T;` directive of the file, the global ones included, in file order: `fqn` the written type with its type arguments as arity (``Repo`1``) and its `global::` qualifier stripped (and then `rooted`: it is read from the global namespace only), `body` the enclosing-namespace chain of the body that holds it (innermost first, empty in the compilation unit and for a `global using static`), `start`/`end` the text range of that body's block (`directiveBlock`). The directive imports the nested types of `T` and its extension methods, for the references inside that range, at the level of `body[0]` (C# spec §14.5.4); in the compilation unit it is the last level of the lookup, with the plain usings. */
    staticDecls: Array<{
        fqn: string;
        rooted: boolean;
        body: string[];
        start: number;
        end: number;
    }>;
    /** The types the `global using static T;` directives of THIS file name (as `staticDecls` writes them), tracked apart like `globalPrefixes` so the consumer's relation pass can aggregate them project-wide. */
    globalStatics: string[];
}
/** The using directives of one namespace declaration that encloses, from outside, the body holding a using directive: `ns` is that declaration's namespace, `prefixes` the namespaces its plain usings name (as written, a `global::` qualifier kept: each is read where the declaration stands, a rooted one from the global namespace), `aliases` the names its using aliases declare, `statics` the types its `using static` directives name (as written, type arguments as their arity, a `global::` qualifier kept like a plain using's), whose nested types and extension methods they import (C# spec §14.5.4). */
interface OuterUsings {
    ns: string;
    prefixes: string[];
    aliases: string[];
    statics: string[];
}
/** A symbol hint, the only kind the C# extractor emits. */
type SymbolHint = Extract<TargetHint, {
    kind: 'symbol';
}>;
/**
 * Collect the `global using Foo.Bar;` namespace prefixes a C# file declares (project-wide
 * imports). Used by the cross-file pre-pass in the consumer's relation pass to aggregate the global usings of every
 * file of a project before per-file resolution, so a `global using` in ANY file of the project
 * qualifies bare names in EVERY file of that project (R5, M6). Aliases and `using static` are file-local (per the C# spec, a `global using static`
 * / `global using alias` is still project-wide, but its members/alias are not a namespace
 * prefix), so only the namespace-import global prefixes are aggregated here.
 */
export declare function collectGlobalUsings(file: ParsedFile): string[];
/**
 * Collect the types the `global using static N.C;` directives of a C# file name (project-wide imports of the nested types and the extension methods of `N.C`), as the cross-file pre-pass of the consumer's relation pass aggregates them per project beside the global namespace imports. A type's type arguments are written as their arity (``Repo`1``), as in a type key.
 */
export declare function collectGlobalUsingStatics(file: ParsedFile): string[];
/**
 * Collect the `global using Alias = Foo.Bar;` aliases a C# file declares (project-wide
 * aliases, A12). Used by the cross-file pre-pass in the consumer's relation pass to aggregate every file's global
 * aliases before per-file resolution, so a `global using` alias declared in ANY file is usable
 * in EVERY file. The alias RHS is resolved fully-qualified vs the global namespace (C# resolves
 * an alias RHS ignoring other usings and the enclosing namespace), so the captured dotted FQN
 * IS the resolved target in the declaring file's context — aggregating `[alias, fqn]` pairs is
 * sufficient. Returned as entries so the consumer's relation pass can union them into a project-wide alias map.
 */
export declare function collectGlobalUsingAliases(file: ParsedFile): Array<[string, string]>;
/** Options for `uses()` — the cross-file global-using scope injected by the pass-level
 *  pre-pass (R5). These prefixes bind below the file's own usings (lowest using tier). */
export interface CsharpUsesOptions {
    /** Namespace prefixes from `global using` directives aggregated across EVERY C# file in the
     *  project (a project-wide import set). Applied to every file's simple-name resolution. */
    projectGlobalUsings?: string[];
    /** Alias name → fully-qualified target from `global using Alias = ...;` directives aggregated
     *  across EVERY C# file of the project (A12), and from `<Using Include Alias>` items. Merged
     *  into this file's alias map BELOW any file-local alias of the same name (a file-local alias
     *  takes precedence). A name listed with 2+ distinct targets is ambiguous → silenced (M7). */
    projectGlobalUsingAliases?: Array<[string, string]>;
    /** The types named by the `global using static T;` directives of EVERY C# file of the project (`CsharpProjectScope.statics`): their nested types and extension methods are imported in every file of the project, at the level of the compilation unit, beside the global usings. Each is read from the global namespace. */
    projectGlobalStatics?: string[];
}
/**
 * One alias-UNRESOLVED per-reference descriptor emitted by `extractCsharpRefs` (the pure half).
 *
 * WHY UNRESOLVED (design §14 Correction A): C# `uses()` consults the MERGED alias map
 * (file-local ∪ project-global) DURING the walk — at `pushRef`'s leftmost-segment alias lookup
 * and the `S::Tail` alias rewrite — to decide whether a reference is emitted at all and with
 * what key. A project-global alias added in ANOTHER file changes what this file emits, so the
 * cached fact must be PRE-assembly: the alias merge + candidate building is deferred entirely to
 * `assembleCsharpCandidates`. The descriptor carries no live AST node (the tree is destroyed
 * after `tree.delete()`) — every node-derived input is precomputed here, notably the
 * enclosing-namespace chain (`enclosingNs`), and, for a `plain`, `attr` or `receiver` reference
 * written inside the body of a type, the declaration keys of the types whose bodies hold it, innermost first (`types`:
 * `['App.Outer+Inner', 'App.Outer']`), whose nested types C# reads before any namespace (spec
 * §7.6.1); the field is absent outside every type body (a type's attributes, base list and constraint clauses lie outside its body, §7.7.1) and on a `global::` reference.
 */
export type CsharpRefDescriptor = 
/** A plain `pushRef(ref, node, line, rooted)` reference: a dotted partial name or bare
 *  identifier. `rooted` (a `global::`-stripped or `using static` target form) resolves
 *  verbatim-only; otherwise alias/enclosing-ns/using-prefix expansion applies on assembly. */
{
    kind: 'plain';
    ref: string;
    line: number;
    rooted: boolean;
    enclosingNs: string[];
    at: number;
    types?: string[];
}
/** An `S::Tail` alias-qualified reference (`alias_qualified_name`, non-`global` alias). Emitted
 *  only on assembly IF the merged alias map binds `aliasName` → its rewritten `${fqn}.${tail}`
 *  resolves verbatim-from-root; otherwise dropped (extern/unknown alias → R13 silence). */
 | {
    kind: 'alias';
    aliasName: string;
    tail: string;
    line: number;
    enclosingNs: string[];
    at: number;
}
/** A named type written in the TARGET of a using alias directive (`using F = A.B.Foo;`, a dependency on that type whether or not the alias is used) or of a `using static` directive (`using static N.C;`, the type whose static members are imported), the container and each type argument of a generic one among them. C# resolves the target in the namespace body that holds the directive, nearest namespace first and the global namespace last, and no using directive or alias of that body takes part (usings of an outer compilation unit would, in C#; reading none of them is a deliberate conservatism) (C# spec §14.5.2), so the group is the enclosing-namespace readings, innermost first, then the name verbatim. The using directives of an enclosing namespace declaration (`outer`, absent when there are none) do take part, at their own namespace: after its reading, an alias they declare of the target's first name decides there and is read where its own directive reads its target; else the types of the namespaces they import (each namespace read where that declaration stands) and the nested types of the types their `using static` directives name, as one CS0104 set. Each reading farther than the first carries the nearer namespaces or types of the target's first name that C# would stop at (`shadow`). `at` is where the directive stands, which tells the outer alias declaration apart. `enclosingNs` is empty for a directive outside any namespace body (a global using, or one above a file-scoped namespace). An alias target may name a namespace as much as a type; a nearer namespace of its first name voids every farther reading through `shadow` (C# spec §7.8.1). */
 | {
    kind: 'target';
    fqn: string;
    line: number;
    enclosingNs: string[];
    at: number;
    outer?: OuterUsings[];
}
/** An attribute usage `[Foo]` / `[FooAttribute]` — TWO readings (`written` + the optional `Attribute`-suffixed form) merged into ONE ordered group on assembly (E9). `rooted` (a `global::`-qualified name, `[global::A.Foo]`) resolves both readings verbatim-only. `alias` (an attribute written after a using alias, `[S::Foo]`) rewrites both readings onto the namespace the merged alias map binds `S` to, each then resolved verbatim from the root as a type's `S::Tail` is; an alias the map does not bind (an extern or unknown alias) drops the attribute. */
 | {
    kind: 'attr';
    written: string;
    suffixed?: string;
    line: number;
    enclosingNs: string[];
    at: number;
    rooted?: boolean;
    alias?: string;
    types?: string[];
}
/** The receiver of a member access through a TYPE name (`Guard.NotNull(x)`, `OrderStatus.Paid`, `Shop.Core.Guard.NotNull(x)`): `chain` is the dotted receiver, leftmost first, without the accessed member. On assembly each prefix (`Shop`, `Shop.Core`, `Shop.Core.Guard`) is one reading, concatenated in that order into ONE group — C# binds the leftmost simple name first and only reads further segments when it names a namespace. Emitted only when the leftmost identifier is not a name this file declares (a local, parameter, field, property, method…), so a value that shadows a type name never manufactures a type edge. `rooted` (a receiver written after `global::`, `global::X.Run()`) reads every prefix verbatim-only, and no declared name shadows it. `members` are the keys of the types around the receiver, innermost first, that can hold a member this file does not show (a `partial` type, or one that lists a base): where the first name is such a member there, the receiver is a value and names no type. Absent when no type around it can. */
 | {
    kind: 'receiver';
    chain: string[];
    line: number;
    enclosingNs: string[];
    at: number;
    rooted?: boolean;
    types?: string[];
    members?: string[];
}
/** An extension-method call `value.Name(…)` on an instance-like receiver: resolved against the
 *  extension-method keys (`<ns>.Name()`) of the enclosing namespaces, each followed by the namespaces
 *  its using directives import where the call stands (`at`), then the global namespace, then the
 *  namespaces the compilation unit's using directives import as one set.
 *  `args` and `typeArgs` count the call's arguments and its written type arguments: an instance method takes the call only when the counts fit it.
 *  `member` is set where the receiver's first name is one the file does not declare, written inside a type: the call is an extension call only when that name is a member of one of `member.types` (the types around the call, innermost first, that can hold a member this file does not show: a `partial` type, or one that lists a base), declared in another part or inherited, and a static call through a type otherwise, so the group is given only where such a type stands around the call; `direct` says the receiver is that name alone, so the member's own type is the receiver's.
 *  `from` are the keys of the types whose bodies hold the call, innermost first: a protected or a private method takes the call only from where it can be called.
 *  `on` holds the written type of the receiver where the file declares it (a parameter, a field, a property or a local with a type of its own; several when declarations of the name in one scope differ), each as the reference that type is, and `self` the key of the enclosing type for a call on `this`: an instance method of that name in such a type, or in a base of it, is what the call binds (C# spec §12.8.10.3), and the group then gives nothing. Both are absent where the receiver's type is not written (`var`, a call result, an inferred lambda parameter). */
 | {
    kind: 'ext';
    name: string;
    line: number;
    enclosingNs: string[];
    at: number;
    args: number;
    typeArgs: number;
    on?: CsharpRefDescriptor[];
    self?: string;
    from?: string[];
    member?: {
        types: string[];
        name: string;
        direct: boolean;
    };
};
/**
 * The pure, alias-UNRESOLVED extract of one C# file — the cacheable fact (design §14 Correction
 * A). It is a function of the file's bytes/AST ALONE: NO `options`, NO alias merge, NO
 * project-global resolution. `assembleCsharpCandidates` turns it (plus the live project-global
 * scope) into the final `DetectedDep[]`.
 */
export interface CsharpExtract {
    /** The file-scoped namespace FQN (`namespace Foo.Bar;`), or '' if none. */
    fileNs: string;
    /** The full FILE-LOCAL using scope from `buildUsingScope` (prefixes, globalPrefixes, aliases,
     *  globalAliases, staticTargets) — alias merge with the project-global set is deferred. */
    scope: UsingScope;
    /** The per-reference descriptors in original walk EMIT ORDER (static targets first, then the
     *  alias-RHS embedded-types walk, then the main walk). Replaying them in order reproduces the
     *  exact `DetectedDep[]` order — load-bearing for the downstream violation-reason order. */
    refs: CsharpRefDescriptor[];
    /** The keys of the types this file declares but keeps to itself (a C#11 `file` type and the types nested in one), written like a declaration key (`App.Helper`, `App.Outer+Inner`). They are not published, yet inside the file a name binds them: the candidate group of a reference ends where such a type would be found, so a public type of the same name farther out is never reached. */
    fileLocalTypes: string[];
}
/**
 * Extract one C# file's alias-UNRESOLVED reference descriptors + full file-local using scope.
 *
 * PURE over the file's bytes/AST: takes NO `options` and does NO alias/using/project-global
 * resolution. Because the AST node is destroyed after `tree.delete()`, every descriptor carries
 * its enclosing-namespace chain PRECOMPUTED as `string[]` (never a live node). The emit ORDER —
 * `using static` targets first, then the C#12 alias-RHS embedded-types walk, then the main
 * type-position walk — is preserved exactly; `assembleCsharpCandidates` replays it in order.
 */
export declare function extractCsharpRefs(file: ParsedFile): CsharpExtract;
/**
 * Assemble the final `DetectedDep[]` from a pure C# extract plus the LIVE project-global scope.
 *
 * This is the live half (design §14 Correction A): it merges the file-local alias map with
 * `options.projectGlobalUsingAliases` (file-local wins, identical to the original `uses`), builds
 * the `usingPrefixes` union (file prefixes ∪ file global-prefixes ∪ `options.projectGlobalUsings`),
 * then replays the extract's descriptors IN ORDER through the `pushRef` / `S::Tail` rewrite /
 * `pushAttribute` candidate-assembly logic — preserving the original emit order (the per-reference
 * group order is load-bearing; it drives the violation-reason order downstream).
 */
export declare function assembleCsharpCandidates(extract: CsharpExtract, options?: CsharpUsesOptions): DetectedDep[];
/** The C# `uses` with the optional cross-file global-using scope — called directly by the
 *  pass-level pre-pass (the consumer's relation pass) to inject project-wide `global using` prefixes. The interface
 *  `uses` (1-arg) on `csharpExtractor` delegates here with no options. */
export declare function csharpUses(file: ParsedFile, options?: CsharpUsesOptions): DetectedDep[];
export declare const csharpExtractor: DependencyExtractor;
export {};
