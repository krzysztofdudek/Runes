import type { DependencyExtractor, DetectedDep, ParsedFile } from './types.mjs';
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
    /** Fully-resolved TARGET type FQN (with the directive's line) of each `using static N.C;` /
     *  `global using static N.C;` directive in this file (A8/A11). The directive names a concrete
     *  type whose static members are imported — that target is a real type dependency of this file,
     *  resolved like an alias RHS (already fully-qualified). NOT a namespace prefix (a sibling
     *  `N.Baz` is never imported). */
    staticTargets: Array<{
        fqn: string;
        line: number;
    }>;
}
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
 * enclosing-namespace chain (`enclosingNs`).
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
}
/** A `using static N.C;` / `global using static N.C;` TARGET edge — the concrete type whose
 *  static members are imported. Resolves verbatim-from-root as its sole candidate (A8/A11). */
 | {
    kind: 'static';
    fqn: string;
    line: number;
}
/** An attribute usage `[Foo]` / `[FooAttribute]` — TWO readings (`written` + the optional
 *  `Attribute`-suffixed form) merged into ONE ordered group on assembly (E9). */
 | {
    kind: 'attr';
    written: string;
    suffixed?: string;
    line: number;
    enclosingNs: string[];
}
/** The receiver of a member access through a TYPE name (`Guard.NotNull(x)`, `OrderStatus.Paid`,
 *  `Shop.Core.Guard.NotNull(x)`): `chain` is the dotted receiver, leftmost first, without the
 *  accessed member. On assembly each prefix (`Shop`, `Shop.Core`, `Shop.Core.Guard`) is one
 *  reading, concatenated in that order into ONE group — C# binds the leftmost simple name first
 *  and only reads further segments when it names a namespace. Emitted only when the leftmost
 *  identifier is not a name this file declares (a local, parameter, field, property, method…),
 *  so a value that shadows a type name never manufactures a type edge. */
 | {
    kind: 'receiver';
    chain: string[];
    line: number;
    enclosingNs: string[];
}
/** An extension-method call `value.Name(…)` on an instance-like receiver: resolved against the
 *  extension-method keys (`<ns>.Name()`) of the enclosing namespaces, then the imported
 *  namespaces as one set, then the global namespace. */
 | {
    kind: 'ext';
    name: string;
    line: number;
    enclosingNs: string[];
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
