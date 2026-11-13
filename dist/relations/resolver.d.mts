import { type SymbolTable } from './symbol-table.mjs';
import type { DetectedDep, TargetHint } from './extractors/types.mjs';
import type { Reachability } from './extractors/csharp-reach.mjs';
/**
 * Who owns a repository file: the unit a resolved reference is attributed to (a module, a package, a directory, whatever the caller groups files by). `undefined` means the file is not owned by any unit, which the resolver treats as the non-event of an unmapped target.
 */
export interface OwnerLookup {
    ownerOf(file: string): string | undefined;
}
export interface ResolvedTarget {
    owner: string;
    resolvedFile: string;
}
export interface ResolverDeps {
    ownerIndex: OwnerLookup;
    symbolTable: SymbolTable;
    /** language-specific path → repo-rel file (or undefined). Injected per language. The resolver passes `symbolTable` as the fifth argument, which `makeResolvePathToFile`'s function reads for Rust crate-root items, and the hint's `callForm` as the sixth, which it reads for the conditions of a TypeScript or JavaScript `require()` or `import()` and of an import whose `resolution-mode` attribute names its mode; a function that takes four ignores both.
     *
     * The function may carry `explainMiss` (added in 1.1.0), which `makeResolvePathToFile`'s function does: asked with the same arguments about a path that bound no file, it says why, for `classifyUse` (see `TargetResolver`). `{ split }` means the path names files of more than one owner, those files sorted (a Go package whose files two owners hold); undefined means it cannot say. `classify`, `resolve` and `resolveFile` never ask it. */
    resolvePathToFile: ((specifier: string, fromFile: string, language: string, isPackage?: boolean, symbolTable?: SymbolTable, callForm?: 'require' | 'import' | 'esm') => string | undefined) & {
        explainMiss?: (specifier: string, fromFile: string, language: string, isPackage?: boolean, symbolTable?: SymbolTable, callForm?: 'require' | 'import' | 'esm') => 'outside' | 'unfollowed' | {
            split: string[];
        } | undefined;
    };
    /**
     * C# only, optional: which of the repository's C# projects the caller's project can see (`buildCsharpReachability`). Absent, every in-repository declaration of a name is a candidate, as before. Given, a symbol hint's definers in a project the calling file's project cannot reach are dropped before the owners are counted, and when a definer lies in the calling file's own project only the definers of that project stay (a type of the compilation wins over one of a referenced assembly of the same name). A definer that declares the name only as internal to its assembly (the C# extractor's `internal:<key>` marker) is dropped too for a caller in another project its project does not name as a friend, when the `Reachability` answers `internalsVisible`. Both `resolve`, `classify` and `resolveFile` apply it.
     */
    reach?: Reachability;
}
/**
 * The tri-state outcome of probing ONE candidate hint:
 *  - `resolved`  — the hint names exactly one definition (a unique mapped owner). That is
 *                  the binding: emit one edge, stop the group.
 *  - `ambiguous` — the hint names a key that WOULD bind here but has ≥2 definitions (a real
 *                  unresolvable ambiguity, symbol axis only). Stop the group with silence;
 *                  do NOT fall through to a farther candidate. It means that and nothing else:
 *                  no other reason for silence answers `ambiguous`, so a consumer may count it
 *                  as "declared in more than one place".
 *  - `absent`    — the hint resolves to no in-repository definition, or to an UNMAPPED file (a
 *                  non-event), or one of its conditions holds (a C# reading with `unless`: the
 *                  language reads the name as something else there, and every reading of the
 *                  group that depends on the condition carries it). Continue to the next,
 *                  farther candidate.
 */
export type Classification = {
    kind: 'resolved';
    owner: string;
    resolvedFile: string;
} | {
    kind: 'ambiguous';
    /** Added in 1.1.0, set by `classifyUse` only: the files the use could name, sorted. */
    candidates?: string[];
} | {
    kind: 'absent';
    /** Added in 1.1.0, set by `classifyUse` only, where the readers can tell (TypeScript, JavaScript, Python, Go, Rust, PHP, Java, Kotlin, C#): `outside` when the use leaves the repository (an installed package, the standard library), `unfollowed` when it names a place of the repository that binds no file, `unowned` when it binds a file of the repository no owner maps, which `resolvedFile` names. */
    reason?: 'outside' | 'unfollowed' | 'unowned';
    resolvedFile?: string;
};
export interface TargetResolver {
    resolve(hint: TargetHint, fromFile: string, language: string): ResolvedTarget | undefined;
    classify(hint: TargetHint, fromFile: string, language: string): Classification;
    /**
     * Added in 1.1.0; `makeResolver` always provides it, a resolver written by hand may leave it out. What one use comes to: its candidate group walked in order exactly as the edge walk walks it (`resolveDetectedEdges`), so `resolved` comes back exactly where that walk binds, with the same owner and file, and a nearer `ambiguous` ends the use there too. Where `classify` answers only the kind, this answer says more:
     *  - `ambiguous` carries `candidates`, the files the use could name, sorted and without repeats: the files that declare the name in each owner (a C# partial type, a JVM name two modules declare, a Ruby constant), every file declaring into a package a star import names, a file whose declarations could not be read and may hold the name, and for Ruby's gates the files of the namespace the lookup stops at or of a nested constant that may be inherited.
     *  - A Go import of a package of the module whose files belong to more than one owner, which `classify` answers `absent` and the edge walk passes by, is `ambiguous` with the package's files, unless a farther candidate binds.
     */
    classifyUse?(candidates: readonly TargetHint[], fromFile: string, language: string): Classification;
    /**
     * The raw resolved file for a candidate hint, independent of ownership: 0 or ≥2
     * distinct files (unresolved or ambiguous) both yield undefined; exactly one file is
     * returned regardless of whether `ownerIndex` maps it to an owner. This is the SAME
     * file-resolution computation `classify` runs internally, minus its final
     * `ownerIndex.ownerOf` step — so a caller that already received `classify`'s `absent`
     * outcome for this SAME hint (which collapses "no file resolved" and "resolved to an
     * unmapped file" into one non-committal answer, by design — an unowned target is a non-event) can distinguish the two
     * without a second, independent resolution algorithm. Used ONLY by the live
     * type-relation gate's typed-edge construction (the consumer's relation pass) to test whether an
     * otherwise-unmapped candidate names a TYPE-COVERED file instead; the owner-bound
     * candidate walk (`resolveCandidateGroup`/`classify`) never calls this and is
     * unaffected by its existence.
     */
    resolveFile(hint: TargetHint, fromFile: string, language: string): string | undefined;
}
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
export declare function resolveCandidateGroup(candidates: readonly TargetHint[], resolver: TargetResolver, fromFile: string, language: string): string | undefined;
/**
 * Resolve every detected reference of ONE file through {@link resolveCandidateGroup} and
 * return the bound edges, each `(line, owner)` at most once. Several references on one
 * line often bind to the same owner (a Python `from m import a, b` offers the module and each
 * name as candidates that all land in one file; a C# line names one type twice); they are one
 * dependency, so they are reported once. Shared by the live pass and the reference-case runner
 * so the two report the same rows.
 */
export declare function resolveDetectedEdges(detected: readonly DetectedDep[], resolver: TargetResolver, fromFile: string, language: string): Array<{
    line: number;
    owner: string;
}>;
export declare function makeResolver(deps: ResolverDeps): TargetResolver & Required<Pick<TargetResolver, 'classifyUse'>>;
