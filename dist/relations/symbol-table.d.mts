export declare class SymbolTable {
    private readonly defs;
    private readonly nestedTails;
    /** `${namespace}\0${package}` → files declaring a DIRECT top-level member of that package (a key
     *  `<package>.<Name>` whose last segment carries no `+` nested-type separator). */
    private readonly packageMembers;
    private key;
    declare(language: string, symbolKey: string, file: string): void;
    /** True when some `::`-qualified key ends in the segment `name` (e.g. `Admin::Order` for
     *  `Order`): a constant of that name is nested in some namespace. Ruby's lexical guard. */
    hasNestedTail(language: string, name: string): boolean;
    /** Exactly one same-language definition → that file; zero or 2+ (ambiguous, incl. unowned) → undefined. */
    resolveUnique(language: string, symbolKey: string): string | undefined;
    /** Number of distinct files declaring `symbolKey` in `language` (0 = absent, ≥2 = ambiguous).
     *  Lets the tri-state resolver tell an ambiguous candidate (≥2) from an absent one (0) —
     *  a distinction `resolveUnique` collapses to undefined. */
    defCount(language: string, symbolKey: string): number;
    /** True when at least one definition exists (the declared-type guard; ≥1 def). */
    has(language: string, symbolKey: string): boolean;
    /** Every distinct file declaring `symbolKey` in `language` (empty when absent). Unlike
     *  `resolveUnique` it does NOT collapse a multi-def key to undefined — the resolver's
     *  set-level nested-split rule needs the full file set to count distinct files across the
     *  verbatim key plus its guarded `+`-splits (≥2 distinct files anywhere → ambiguous). */
    filesFor(language: string, symbolKey: string): string[];
    /** Every distinct file declaring a DIRECT top-level member of package `packageFqn` in
     *  `language`'s namespace (a key `<packageFqn>.<Name>`, never a nested `+` key and never a
     *  sub-package member). The candidate set of a star / on-demand import of that package, which
     *  the resolver collapses by owner. Empty when no file declares into the package. */
    filesInPackage(language: string, packageFqn: string): string[];
}
