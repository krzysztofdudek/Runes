import type { Parser, Tree } from 'web-tree-sitter';

export type DepKind = 'import' | 'call' | 'extends' | 'implements' | 'type-ref' | 'construct';

/** One member of a symbol resolution SET (C# only). `symbolKey` is resolved exactly like a
 *  plain symbol hint; `nestedOnly` (R4) restricts it to the guarded nested-type `+`-split
 *  reading, never the verbatim dotted reading. `shadow` voids the member as it voids a hint. */
export interface SymbolSetMember { symbolKey: string; nestedOnly?: boolean; shadow?: string[] }

/**
 * A condition under which a C# reading binds nothing (`TargetHint.unless`).
 *
 * `instance-method`: the reading is an extension method of a call `value.method(…)` with `args` arguments and `typeArgs` written type arguments. `receivers` are the ordered groups of readings of each type the file writes for the call's receiver, `self` the key of the enclosing type for a call on `this`, and `from` the keys of the types whose bodies hold the call, innermost first. The condition holds when a type a group binds (or `self`) has an instance method of that name that the call fits by those counts and that the calling code can reach: one the type declares in any part, or one of its base classes in the repository, to any depth (for an interface, of its base interfaces). A protected method is reached from the type that declares it and from the types derived from it, and through an instance only when the instance's type is the calling type or derives from it (§7.5.4); a private one is reached from the declaring type alone. The interfaces a class implements are not read: member lookup in a class does not read them (C# spec §12.5), and an explicit implementation is reached through the interface alone. C# turns to extension methods only when no instance method applies (§12.8.10.3).
 *
 * `member`: the reading is a type read for the receiver of a member access whose first name is `name`, written inside the types `types` (their keys, innermost first; only the types that can hold a member their file does not show, a `partial` type or one that lists a base). C# reads every member of the types around a simple name before any namespace (§12.8.4). The condition holds when the nearest of `types` that knows the name has it as a member that is no type: a field, property, event or method the type declares in any part, or one of a base class in the repository that a derived type can see. A nested type of that name found first leaves the reading standing.
 *
 * `no-member`: the reading is an extension method of a call whose receiver's first name `name` the file does not declare, so the receiver is a value only as such a member. The condition holds when the nearest of `types` that knows the name has it as a nested type, or none of them knows it: the call is then a static call through a type. With `call` (the receiver is that name alone), it also holds when the member is a field or a property whose written type has an instance method the call fits, as `instance-method` reads it. With `own` (the receiver is written `this.<name>`), the name is a member for certain, so the condition holds only in that last way: where no type of `types` knows the name (a member of a base outside the repository), the reading stands.
 *
 * A type of `self`, `from` and `types` that is a C#11 `file` type of the referencing file is written `file:<key>`, as in `TargetHint.within`: the resolver reads for it the bases that file records for its `file` type, and nothing a published type of the same name declares.
 *
 * `argTypes`, on `instance-method` and on the `call` of `no-member`, is what the file writes of the type of each argument, in order (`CsharpArgType`). An instance method the call fits by its counts does not take the call when the type of one argument is one the parameter there cannot take, as far as the written types say for certain; an argument or a parameter whose type is not known takes part in nothing.
 */
export type CsharpCondition =
  | { kind: 'instance-method'; method: string; args: number; typeArgs: number; argTypes?: CsharpArgType[]; receivers: TargetHint[][]; self?: string; from: string[] }
  | { kind: 'member'; types: string[]; name: string }
  | { kind: 'no-member'; types: string[]; name: string; call?: { method: string; args: number; typeArgs: number; argTypes?: CsharpArgType[]; from: string[] }; own?: true };

/**
 * What a C# file writes of the type of one argument of a call: the keyword of a predefined type (`string`); `type`, the ordered group of readings of the written type of the parameter, field, property or local the argument is; `member`, the readings of the type a member is read through (`ImageType.Primary`), which is the argument's type when that type is an enum, and says nothing where the first name is a member of one of `unless.types` (the types around the call that can hold a member the file does not show); or null where the file writes none.
 */
export type CsharpArgType = string | { type: TargetHint[] } | { member: TargetHint[]; unless?: { types: string[]; name: string } } | null;

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
      /** C#: the key of a type whose body holds the reference. `symbolKey` is `<key>+<name>`, the nested type of that type as the reference names it. The resolver reads it in that type and, when the type declares none, among the nested types of its base classes declared in the repository, nearest first (C# spec §7.6.1). A C#11 `file` type of the referencing file is written `file:<key>`: a published type, or a `file` type of another file, may share its key, and the resolver reads for it the bases its own file records (`file-base:<key>`) and nothing recorded under the published key. Absent = `symbolKey` is read as it stands. */
      within?: string;
      /** C#: the two readings of an attribute `[Name]`, each an ordered group of its own: the name as written and, unless the written name already ends in `Attribute`, the name with that suffix. `symbolKey` is the written name. The resolver binds each group by itself and takes the reading that binds an attribute class, a class whose base classes reach `System.Attribute` (C# spec §23.3); see `makeResolver`. Absent = an ordinary reading. */
      attribute?: { written: TargetHint[]; suffixed?: TargetHint[] };
      /** C#: the counts of the call an extension-method reading stands for, its arguments beside the receiver and its written type arguments. Where the reading would bind, the resolver asks whether one of its definers declares, under the reading's key, an extension method that can take them (the `shapes:<key>` record of that file; a definer that declares no such record takes any call): when none can, the reading binds nothing, as a name the repository does not declare. A reading that names two owners stays ambiguous. Absent = the reading binds whatever the call passes. */
      takes?: { args: number; typeArgs: number };
      /** C#: conditions under which the reading binds nothing (`CsharpCondition`). Where one holds, the resolver reads the candidate as it reads a name the repository does not declare: `classify` answers `absent`, `resolve` and `resolveFile` nothing. Every reading of a group that depends on a condition carries it, so the group binds nothing and ends in silence, and no outcome is an ambiguity. Absent = the reading stands. */
      unless?: CsharpCondition[];
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
