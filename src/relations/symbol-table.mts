/**
 * The namespace a language's declarations live in. Java and Kotlin compile into ONE JVM
 * namespace — a Kotlin file imports a Java class by its FQN and a Java file imports a Kotlin
 * class (or a Kotlin file facade) the same way — so both languages declare into, and resolve
 * against, the shared `jvm` namespace. Every other language keeps its own.
 */
const NAMESPACE_OF: ReadonlyMap<string, string> = new Map([['java', 'jvm'], ['kotlin', 'jvm']]);

function namespaceOf(language: string): string {
  return NAMESPACE_OF.get(language) ?? language;
}

export class SymbolTable {
  private readonly defs = new Map<string, Set<string>>(); // `${namespace}\0${symbolKey}` → set of defining files
  private readonly nestedTails = new Set<string>(); // `${namespace}\0${lastSegment}` of every `A::B`-style key
  /** `${namespace}\0${package}` → files declaring a DIRECT top-level member of that package (a key
   *  `<package>.<Name>` whose last segment carries no `+` nested-type separator). */
  private readonly packageMembers = new Map<string, Set<string>>();
  /** `${namespace}\0${prefix}` of every dotted namespace a declared key lies in: each proper dot prefix of the key's part before its first `+` (`A.B.Order` lies in `A` and `A.B`; `A.Outer+Inner` in `A`). */
  private readonly namespaces = new Set<string>();
  /** `${namespace}\0${head}` → value → files, for every key written `<head>\t<value>`: a fact a file states about `head` that carries a value (see `declare`). */
  private readonly listed = new Map<string, Map<string, Set<string>>>();
  /** How many times `declare` has been called: an answer read from the table holds while this has not moved. */
  private declarations = 0;
  private key(language: string, symbolKey: string): string {
    return `${namespaceOf(language)}\0${symbolKey}`;
  }
  declare(language: string, symbolKey: string, file: string): void {
    this.declarations++;
    // A key with a tab is no name: `<head>\t<value>` states a value about `head` (the C# extractor records a type's base list this way), read back by `valuesOf` and by nothing else.
    const tab = symbolKey.indexOf('\t');
    if (tab !== -1) {
      const head = this.key(language, symbolKey.slice(0, tab));
      let values = this.listed.get(head);
      if (!values) { values = new Map(); this.listed.set(head, values); }
      const value = symbolKey.slice(tab + 1);
      let files = values.get(value);
      if (!files) { files = new Set(); values.set(value, files); }
      files.add(file);
      return;
    }
    const k = this.key(language, symbolKey);
    let s = this.defs.get(k);
    if (!s) { s = new Set(); this.defs.set(k, s); }
    s.add(file);
    const sep = symbolKey.lastIndexOf('::');
    if (sep !== -1) this.nestedTails.add(this.key(language, symbolKey.slice(sep + 2)));
    const plus = symbolKey.indexOf('+');
    const typePart = plus === -1 ? symbolKey : symbolKey.slice(0, plus);
    for (let i = typePart.indexOf('.'); i !== -1; i = typePart.indexOf('.', i + 1)) this.namespaces.add(this.key(language, typePart.slice(0, i)));
    const dot = symbolKey.lastIndexOf('.');
    if (!symbolKey.slice(dot + 1).includes('+')) {
      const pk = this.key(language, dot === -1 ? '' : symbolKey.slice(0, dot));
      let p = this.packageMembers.get(pk);
      if (!p) { p = new Set(); this.packageMembers.set(pk, p); }
      p.add(file);
    }
  }
  /** True when some `::`-qualified key ends in the segment `name` (e.g. `Admin::Order` for
   *  `Order`): a constant of that name is nested in some namespace. Ruby's lexical guard. */
  hasNestedTail(language: string, name: string): boolean {
    return this.nestedTails.has(this.key(language, name));
  }
  /** True when some declared key of `language` lies inside the dotted namespace `name` (a key `<name>.<...>` before any `+`): the repository declares that namespace. C#'s lookup stops at a nearer namespace of a name, which no key names by itself. */
  hasNamespace(language: string, name: string): boolean {
    return this.namespaces.has(this.key(language, name));
  }
  /** Every value declared about `head` in `language` (each key `<head>\t<value>` some file declared), with the files that declared it, in the order first declared; empty when none. */
  valuesOf(language: string, head: string): Array<{ value: string; files: string[] }> {
    const values = this.listed.get(this.key(language, head));
    return values ? [...values].map(([value, files]) => ({ value, files: [...files] })) : [];
  }
  /** Exactly one same-language definition → that file; zero or 2+ (ambiguous, incl. unowned) → undefined. */
  resolveUnique(language: string, symbolKey: string): string | undefined {
    const s = this.defs.get(this.key(language, symbolKey));
    if (!s || s.size !== 1) return undefined;
    return [...s][0];
  }
  /** Number of distinct files declaring `symbolKey` in `language` (0 = absent, ≥2 = ambiguous).
   *  Lets the tri-state resolver tell an ambiguous candidate (≥2) from an absent one (0) —
   *  a distinction `resolveUnique` collapses to undefined. */
  defCount(language: string, symbolKey: string): number {
    return this.defs.get(this.key(language, symbolKey))?.size ?? 0;
  }
  /** True when at least one definition exists (the declared-type guard; ≥1 def). */
  has(language: string, symbolKey: string): boolean {
    return this.defCount(language, symbolKey) > 0;
  }
  /** Every distinct file declaring `symbolKey` in `language` (empty when absent). Unlike
   *  `resolveUnique` it does NOT collapse a multi-def key to undefined — the resolver's
   *  set-level nested-split rule needs the full file set to count distinct files across the
   *  verbatim key plus its guarded `+`-splits (≥2 distinct files anywhere → ambiguous). */
  filesFor(language: string, symbolKey: string): string[] {
    const s = this.defs.get(this.key(language, symbolKey));
    return s ? [...s] : [];
  }
  /** Every distinct file declaring a DIRECT top-level member of package `packageFqn` in
   *  `language`'s namespace (a key `<packageFqn>.<Name>`, never a nested `+` key and never a
   *  sub-package member). The candidate set of a star / on-demand import of that package, which
   *  the resolver collapses by owner. Empty when no file declares into the package. */
  filesInPackage(language: string, packageFqn: string): string[] {
    const s = this.packageMembers.get(this.key(language, packageFqn));
    return s ? [...s] : [];
  }
}

/** How many declarations `table` has taken so far. An answer read from the table, kept by a resolver, holds while this has not moved. Internal to Runes: the package exports `SymbolTable` alone. */
export function declarationCount(table: SymbolTable): number {
  return table['declarations'];
}
