import type { SymbolTable } from './symbol-table.mjs';
import type { DetectedDep, TargetHint } from './extractors/types.mjs';
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
    /** language-specific path → repo-rel file (or undefined). Injected per language. */
    resolvePathToFile: (specifier: string, fromFile: string, language: string, isPackage?: boolean) => string | undefined;
}
/**
 * The tri-state outcome of probing ONE candidate hint:
 *  - `resolved`  — the hint names exactly one definition (a unique mapped owner). That is
 *                  the binding: emit one edge, stop the group.
 *  - `ambiguous` — the hint names a key that WOULD bind here but has ≥2 definitions (a real
 *                  unresolvable ambiguity, symbol axis only). Stop the group with silence;
 *                  do NOT fall through to a farther candidate.
 *  - `absent`    — the hint resolves to no in-repository definition, or to an UNMAPPED file (a
 *                  non-event). Continue to the next, farther candidate.
 */
export type Classification = {
    kind: 'resolved';
    owner: string;
    resolvedFile: string;
} | {
    kind: 'ambiguous';
} | {
    kind: 'absent';
};
export interface TargetResolver {
    resolve(hint: TargetHint, fromFile: string, language: string): ResolvedTarget | undefined;
    classify(hint: TargetHint, fromFile: string, language: string): Classification;
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
export declare function makeResolver(deps: ResolverDeps): TargetResolver;
