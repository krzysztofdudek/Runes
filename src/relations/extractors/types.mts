import type { Parser, Tree } from 'web-tree-sitter';

export type DepKind = 'import' | 'call' | 'extends' | 'implements' | 'type-ref' | 'construct';

/** One member of a symbol resolution SET (C# only). `symbolKey` is resolved exactly like a
 *  plain symbol hint; `nestedOnly` (R4) restricts it to the guarded nested-type `+`-split
 *  reading, never the verbatim dotted reading. `shadow` voids the member as it voids a hint. */
export interface SymbolSetMember { symbolKey: string; nestedOnly?: boolean; shadow?: string[] }

export type TargetHint =
  | { kind: 'path'; specifier: string; isPackage?: boolean; callForm?: 'require' | 'import' }
  | {
      kind: 'symbol';
      /** The candidate's OWN display key — what `groupContaining`/`symbolKeys` read, and what
       *  pins the ordered-group shape. Always present. */
      symbolKey: string;
      /** R4 (C#): resolve `symbolKey` ONLY via the guarded nested-type `+`-split, never the
       *  verbatim dotted form. A `using A;` prefix applied to a multi-segment ref `B.Type` is
       *  only valid when `A.B` is a declared TYPE (→ `A.B+Type`); a sub-namespace reading
       *  (`A.B.Type` dotted) is forbidden. Absent = resolve verbatim + splits normally. */
      nestedOnly?: boolean;
      /** R9/R8 (C#): when present, classification resolves the UNION of files across ALL set
       *  members (each honoring its own `nestedOnly`) and applies the distinct-file rule:
       *  0 → absent, exactly 1 → resolved, ≥2 → ambiguous (CS0104 / co-definition silence).
       *  The candidate's own `symbolKey` still drives the display shape; `set` drives only
       *  classification. Absent = resolve `symbolKey` alone as a singleton. */
      set?: SymbolSetMember[];
      /** C#: the dotted names of nearer namespaces or types the language's lookup would stop at before it reaches this reading. When the repository declares any of them, as a namespace (some declared key lies inside it) or as a type, the reading binds nothing and the walk goes on to the next candidate. Absent = no such name. */
      shadow?: string[];
      /** C#: the key of a type whose body holds the reference. `symbolKey` is `<within>+<name>`, the nested type of that type as the reference names it. The resolver reads it in that type and, when the type declares none, among the nested types of its base classes declared in the repository, nearest first (C# spec §7.6.1). Absent = `symbolKey` is read as it stands. */
      within?: string;
      /** C#, with `within`: the reference stands where a value's name does (the first name of a member access). C# reads every member of the type there, not its nested types alone (spec §12.8.4): when the type, in any part, or a base class of it in the repository declares a field, property, event or method of the reference's first name (a private one of a base class is not seen), the name is that member and the resolver ends the group in silence (`classify` answers `ambiguous`), unless a nested type of that name is found nearer. */
      orMember?: boolean;
      /** C#: a guard at the head of an extension-method group, never a binding, for a call whose receiver's first name the file does not declare. `types` are the keys of the types around the call, innermost first, and `name` that first name. The receiver is a value, and the extension readings after the guard are read, only when the nearest of those types that knows the name has it as a member that is no type (in another part, or from a base class in the repository); where the name is a nested type there, or no type around the call knows it, the call is a static call through a type and the resolver ends the group in silence. `call`, set where the receiver is that name alone, is the call as `instance` holds it: where the member is a field or a property whose written type has an instance method the call fits, the group ends in silence too. */
      memberOnly?: { types: string[]; name: string; call?: { method: string; args: number; typeArgs: number } };
      /** C#: the two readings of an attribute `[Name]`, each an ordered group of its own: the name as written and, unless the written name already ends in `Attribute`, the name with that suffix. `symbolKey` is the written name. The resolver binds each group by itself and takes the reading that binds an attribute class, a class whose base classes reach `System.Attribute` (C# spec §23.3); see `makeResolver`. Absent = an ordinary reading. */
      attribute?: { written: TargetHint[]; suffixed?: TargetHint[] };
      /** C#: a guard at the head of an extension-method group, never a binding. `method` is the called name, `args` and `typeArgs` the number of its arguments and of its written type arguments, `receivers` the ordered group of readings of each type the file writes for the call's receiver, and `self` the key of the enclosing type for a call on `this`. When a type one of them binds, a base class or an interface of it in the repository, or another part of it, declares an instance method of that name whose parameter and type parameter counts the call fits, the call is that method's (C# spec §12.8.10.3) and the resolver ends the group in silence (`classify` answers `ambiguous`); otherwise the guard is absent and the extension readings after it are read. */
      instance?: { method: string; args: number; typeArgs: number; receivers: TargetHint[][]; self?: string };
      /** Ruby only: a lexical nesting candidate `N::A::B` carries its first-segment name
       *  `N::A`. When `N::A` has an in-repo definition but the candidate itself has none, Ruby
       *  has already committed to `N::A` and will not look further out, so the reference is
       *  silenced (ambiguous) instead of falling through to a farther candidate. */
      rubyAnchor?: string;
      /** Ruby only: set on the top-level fallback of a reference written inside a namespace;
       *  the value is the reference's first segment `A`. When any in-repo namespace nests a
       *  constant named `A` (`X::A`), that constant may reach the reference through the
       *  enclosing class's ancestors, so the fallback is silenced (ambiguous). */
      rubyInheritGuard?: string;
      /** Java and Kotlin: the key names a type of the referencing file's own package (or a member type of one), written without an import. The resolver then sees only the definers that file's source set can see (`src/test` sees `src/main`, `src/main` never sees `src/test`). Absent = every definer counts. */
      samePackage?: boolean;
    };

/**
 * A detected reference carries an ORDERED list of alternative target hints, in the
 * language's name-binding order (nearest binding first, verbatim/top-level last). The
 * per-reference resolver (the consumer's relation pass) walks the list and takes the FIRST candidate that
 * binds to a unique mapped definition — that IS the binding — emits at most one edge, and
 * stops; a present-but-ambiguous nearer candidate silences the whole group.
 *
 * A single-hint extractor wraps its one hint as a ONE-ELEMENT `candidates` array (use the
 * `single` helper). For a one-element group the ordered walk degenerates to a single
 * resolve with byte-identical outcomes — no path-resolved extractor changes behavior.
 */
export interface DetectedDep { candidates: TargetHint[]; kind: DepKind; line: number }

/** Wrap one hint as a one-element ordered candidate group. */
export function single(hint: TargetHint, kind: DepKind, line: number): DetectedDep {
  return { candidates: [hint], kind, line };
}
export interface DeclaredSymbol { symbolKey: string; line: number }
export interface ParsedFile {
  path: string;
  content: string;
  tree: Tree;
  language: string;
  /** A fresh parser of the runtime that built `tree`. Only the Kotlin extractor uses it, to re-parse spans of a file with syntax errors; a damaged Kotlin file without it throws. */
  newParser?: () => Parser;
}
export interface DependencyExtractor {
  readonly languages: ReadonlySet<string>;
  /** Monotonically increasing integer; bumped on any change to this extractor's
   *  `declarations()` or `uses()` output shape (keys, ordering, new detected kind).
   *  Folds into the AST cache key so that a version bump automatically invalidates
   *  all cached entries for this extractor. */
  readonly rev: number;
  declarations(file: ParsedFile): DeclaredSymbol[];
  uses(file: ParsedFile): DetectedDep[];
}
