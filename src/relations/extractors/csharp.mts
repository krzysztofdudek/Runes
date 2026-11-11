import type { Node } from 'web-tree-sitter';
import { walk } from '../../ast/walk.mjs';
import { indexScopes, walkScoped, walkWithParent, type ParentOf } from './scope-walk.mjs';
import type {
  DependencyExtractor,
  DetectedDep,
  DeclaredSymbol,
  ParsedFile,
  TargetHint,
  CsharpCondition,
  SymbolSetMember,
} from './types.mjs';

/**
 * C# dependency extractor — the HARDEST language, and the design's poster child for
 * SymbolTable resolution.
 *
 * WHY A SYMBOL TABLE (and why it is harder than every imports-only language): C# has
 * NO file-level import that names a file. A `using Foo.Bar;` names a NAMESPACE, and a
 * namespace is a symbol that spans arbitrarily many files in arbitrarily many
 * directories (one file may declare several namespaces; one namespace may be split
 * across the tree). There is no compile-time file→file edge in the syntax. The
 * dependency EDGE therefore comes from a SYMBOL USE — a type reference, a `new`, a base
 * type, a qualified name — resolved to a fully-qualified name (FQN) and looked up in the
 * shared SymbolTable.
 *
 * THE MODEL (mirrors kotlin.ts: declarations build FQN keys, uses emit `{kind:'symbol'}`
 * hints, NO resolve-path branch):
 *
 *  - declarations(file): each TYPE's FQN. The enclosing namespace is read from the
 *    ancestor chain — a `namespace_declaration` (block `namespace Foo { }`) or a
 *    `file_scoped_namespace_declaration` (`namespace Foo.Bar;`), with nested namespaces
 *    concatenated. For each class/interface/struct/record/enum declaration, emit
 *    `<namespace>.<TypeChain>`, where `<TypeChain>` is the enclosing-TYPE chain joined by
 *    the .NET reflection separator `+` and ending in the type's own simple name: a
 *    top-level type is `App.Type`, a nested `Inner` in `Outer` is `App.Outer+Inner`, a
 *    file-scope nested type is `Outer+Inner`. A nested type emits ONLY its `+` key, never
 *    also the bare simple name — that removes the collision that would otherwise let a
 *    nested `Inner` silence a legitimate top-level `App.Inner`. These populate the shared
 *    SymbolTable as FQN→file. Separator isolation: nested keys use `+`, namespace boundaries
 *    use `.`, so a dot-only use candidate never accidentally matches a `+` key.
 *
 *  - uses(file): build the file's USING SCOPE first — the set of namespace prefixes from
 *    each PLAIN `using Foo.Bar;` and `global using Foo.Bar;` (D6: a `using_directive` with no
 *    `static` token child and no `name` field), plus an ALIAS map from `using Alias = Foo.Bar;`
 *    (D6: the `name` field carries the alias; the `qualified_name` sibling is the aliased FQN).
 *    `using static X;` (a `static` token child) is SKIPPED — it imports a type's static MEMBERS,
 *    not a namespace. A `global using Foo.Bar;` applies to every file of its PROJECT (R5, M6):
 *    the consumer's relation pass groups the files by nearest `.csproj` (csharp-project.ts), aggregates each project's
 *    global-using prefixes — plus its MSBuild `<Using>` items and SDK implicit usings — and
 *    injects them into each file's `uses(file, { projectGlobalUsings })` as the lowest using tier. Then, for each type reference (detected across every syntactic
 *    type position — base/`new`, field/property/parameter/return/local types, generic base names
 *    and type arguments, the type arguments of a generic METHOD call (`services.AddScoped<IFoo, Foo>()`, `Resolve<Ctx>()`; never the method name), member-access receivers through a type name (`Guard.NotNull()`), attributes `[Foo]`/`[FooAttribute]` (a generic one by its name without type arguments, `[A.Gen<T>]` as `A.Gen`, and one after a using alias, `[S::Foo]`, in the aliased namespace), generic constraints, `typeof`/`is`/`as`/
 *    cast operands, tuple/array/nullable element types (a named tuple type argument the grammar misreads as comparisons included), the element type of `new T[n]` and `stackalloc T[n]`, an explicitly typed `foreach (T x in …)`, a declaration expression (`out T x`, `(T a, U b) = …`), and a C#12 alias RHS's embedded named
 *    types), build ONE ORDERED candidate group in C# name-binding order (nearest scope first,
 *    the compilation unit's usings LAST), and emit it as a single `DetectedDep`:
 *      [nested types of the enclosing types]          ← `<ns>.<Outer>+<Name>`, innermost type first (§7.6.1)
 *        ++ [alias-expansion?]                         ← leftmost segment is a local alias
 *        ++ [enclosing-namespace chain innermost→outermost]
 *        ++ [verbatim / bare top-level]                ← the global namespace's own member
 *        ++ [using-prefix block, code-point sorted]    ← the compilation unit's usings: ONE binding level (CS0104 set), farthest, last (C# spec §7.8.1 reads a namespace's members before the usings of its declaration, and the compilation unit declares the global namespace)
 *    The per-reference resolver (the consumer's relation pass) walks this group and takes the FIRST candidate
 *    that binds to a UNIQUE mapped definition — that IS the binding; it emits at most one
 *    edge and STOPS, never reaching a farther candidate. A nearer candidate that is
 *    present-but-ambiguous SILENCES the whole group rather than leaking to the verbatim
 *    top-level interpretation. The verbatim form therefore only binds when nothing nearer does
 *    — which closes the decisive C# false positive (a partially-qualified ref whose verbatim
 *    top-level reading coincides with another node's same-named type). Three C# lookup rules are
 *    encoded as hint metadata, invisible to the group's display shape (which reads only the
 *    candidate's `symbolKey`):
 *      • the using-prefix candidates form ONE CS0104 SET (R9): classification resolves the union
 *        of all using expansions; 2+ distinct files → ambiguous → silence (two imports each
 *        defining the same simple name is a real C# ambiguity, never an arbitrary pick).
 *      • a using-prefix candidate on a MULTI-segment ref is `nestedOnly` (R4): `using A;` + `B.T`
 *        may bind the nested type `A.B+T` (B a type, T nested) but NEVER the dotted `A.B.T`
 *        (B a sub-namespace) — `using A;` imports the TYPES of exactly A, not A's namespaces.
 *      • the alias candidate carries a CO-DEFINITION set (R8): the alias target competes with a
 *        same-named enclosing-ns member; 2+ resolving → ambiguous → silence.
 *    A `global::`-rooted name (R12), a single name (`global::Settings`) as much as a dotted one, in a type position, an attribute (`[global::A.Foo]`, both of its readings) or as the receiver of a member access (`global::Guard.NotNull(o)`, every prefix), is stripped and resolved from the root as its sole candidate (a `global::Program` then falls back to the implicit `Program`);
 *    a non-`global` extern/using alias (`Lib::A.B`) is left intact (its `::` text cannot collide
 *    with a dot-only key → R13 silence-by-luck). Nested-type recovery is centralized in the
 *    resolver: for any dotted candidate it also tries the guarded `+`-boundary split (split
 *    `s1..sk + '+' + s_{k+1}..sn` only when `s1..sk` is a declared TYPE), so a use of
 *    `Outer.Inner` resolves to the `Outer+Inner` declaration key.
 *
 * SILENCE-ON-DOUBT (D8 — no waiver; a false positive blocks CI with no escape). All of
 * the following stay silent here, by construction:
 *   - reflection (`Type.GetType`, `Activator.CreateInstance`) / source generators — they surface no resolvable qualified type, so any candidate FQN they do emit resolves to nothing. (Two forms are NOT dynamic: an extension-method call, which C# binds at compile time through the namespaces in scope, so it resolves against the `<ns>.<Name>()` extension keys — see `extensionKey`; and DI registration or service location such as `AddScoped<IFoo, Foo>()`, whose type arguments the compiler binds like any other type reference. Only what the container hands out at run time stays invisible.)
 *   - `using static X;` — skipped (no namespace prefix recorded).
 *   - a bare name that equals a type parameter in scope (`T x;`, `GetRequiredService<T>()` inside `M<T>()`, `Entity` inside `class Repository<Entity>`) — it names the type parameter, never a same-named type of the repository (`isTypeParameterInScope`).
 *   - IMPLICIT / SDK `global using`s — read from the project file when `<ImplicitUsings>` is on,
 *     but they name external namespaces, so a bare name they qualify resolves to nothing unless
 *     the repository declares it there → SILENCE. (DECLARED `global using`s are aggregated per
 *     project per R5 above.)
 *   - external-assembly / BCL types (System.*, Microsoft.*) — emit candidate FQNs, but
 *     they resolve to no in-repository file → never flagged.
 *   - any reference that does not resolve to exactly one mapped file (zero or ≥2 matches across
 *     its candidate group) → silence.
 *
 * NO resolve-path branch: symbol hints route through the table; `makeResolvePathToFile`
 * returns undefined for csharp.
 *
 * v1 SCOPE = EXISTENCE. The edge is the TYPE DEPENDENCY (the symbol use). Method-call
 * relation-TYPE classification (calls vs uses vs extends) is deferred — this extractor
 * only establishes that a dependency on another node's type exists.
 *
 * D6 PROBE (verified against the shipped tree-sitter-c_sharp wasm by parsing samples):
 *   - using_directive: PLAIN `using Foo.Bar;` → `using` token + `qualified_name` child
 *     (or a single `identifier` child for a one-segment namespace), no `name` field.
 *     `using static X;` → an anonymous `static` token child present. `global using ...;`
 *     → an anonymous `global` token child. Alias `using Gw = Foo.Bar;` → `name` FIELD =
 *     identifier `Gw`, plus the aliased `qualified_name`/`identifier` sibling.
 *   - file_scoped_namespace_declaration: `name` field = qualified_name|identifier whose
 *     `.text` is the namespace FQN.
 *   - namespace_declaration (block): `name` field + `body=declaration_list`; nests.
 *   - class/interface/struct/record/enum _declaration: `name` field = identifier.
 *   - base_list: a CHILD (not a field) of the type decl; its namedChildren are the base
 *     types ({qualified_name, identifier, generic_name, primary_constructor_base_type}).
 *   - object_creation_expression: `type` field = identifier (bare) | qualified_name | …
 */

const TYPE_DECLARATION_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'struct_declaration',
  'record_declaration',
  'record_struct_declaration',
  'enum_declaration',
]);

/** The declarations that publish a type key: the type declarations and the delegate, which declares a type (C# spec §21) but has no body, so it never holds a member or a nested type and takes no part in the scopes the walk carries. */
const TYPE_KEY_DECLARATION_TYPES = new Set([...TYPE_DECLARATION_TYPES, 'delegate_declaration']);

/**
 * The file-scoped namespace FQN (`namespace Foo.Bar;`), or '' if the file has none.
 *
 * D6 GOTCHA: a `file_scoped_namespace_declaration` does NOT nest the type declarations
 * as its children — the types are SIBLINGS in the `compilation_unit`. (C# allows at most
 * one file-scoped namespace, and it cannot mix with block namespaces at top level.) So
 * the ancestor walk in `blockNamespace()` cannot see it; it must be read off the
 * compilation unit once and prefixed onto every type's namespace.
 */
function fileScopedNamespace(root: Node): string {
  let ns = '';
  walk(root, (node) => {
    if (node.type === 'file_scoped_namespace_declaration') {
      const nameField = node.childForFieldName('name');
      if (nameField !== null && nameField.text !== '') ns = nameField.text;
      return false; // at most one; do not descend
    }
    return undefined;
  });
  return ns;
}

/**
 * What the declarations around a node say about it, carried down the tree-cursor walk instead of read by climbing `.parent` from each node (which costs the square of the depth on a deeply nested file). A scope is what a climb from the node's PARENT would find: the block namespaces and types around it, the type parameters in scope, whether it sits inside `nameof(…)`, and the few shapes (a chain of member accesses, a nest of tuples) whose meaning depends on the ancestors a step or two above. The scope of a node is read from `csBelow` of its parent, as `csSeen` resolves it for that node.
 */
interface CsScope {
  /** The innermost block namespace around the node. */
  readonly ns: NsFrame | null;
  /** The enclosing-TYPE chain, outermost first, joined by `+` (the .NET reflection FQN separator) — distinct from the namespace `.` so a nested key lives in a disjoint string space from any dot-only use candidate (separator isolation). A nested `class Inner` inside `class Outer` yields `Outer`; deeper nesting `Outer+Mid`; empty when the node is not inside a type. */
  readonly chain: string;
  /** The enclosing-TYPE chain of the types whose BODY holds the node, joined by `+` as `chain` is. A member of a type, a nested type included, is in scope in that type's body only, never in its attributes, its base list or its constraint clauses (C# spec §7.7.1), so a type's own header is read with the chain of the types around the type, not with its own name. */
  readonly bodyChain: string;
  /** The nearest type declaration around the node, or null. */
  readonly typeDecl: { readonly node: Node; readonly nested: boolean; readonly fileLocal: boolean; readonly seen: TypeSeen } | null;
  /** True when a type around the node carries the C#11 `file` modifier: a type nested in one cannot escape the file either. */
  readonly fileLocal: boolean;
  /** The type parameters in scope for the node. */
  readonly tp: TypeParameters | null;
  /** The type parameters in scope BEFORE the declaration whose children these are: its attribute lists do not see its own parameters (`[A(typeof(T))] class C<T>` names an outer `T`). Set only on the direct children of a declaration that may carry type parameters. */
  readonly tpSkip: TypeParameters | null | undefined;
  /** True when the node sits inside the operand of `nameof(…)`. */
  readonly nameof: boolean;
  /** True when an `extension_declaration` (C# 14 extension block) stands between the node and the nearest type declaration. */
  readonly extBelow: boolean;
  /** The member accesses the node is the receiver of, nearest first: only a member access nests directly in the `expression` of another, so the chain is read from the walk. */
  readonly access: { readonly node: Node; readonly outer: CsScope['access'] } | null;
  /** Where the node sits in a nest of tuples: directly under a tuple (`tuple`) or under an argument of one (`arg`), and the outermost tuple of the nest of tuples-in-arguments-of-tuples. */
  readonly tuple: { readonly stage: 'tuple' | 'arg'; readonly root: Node } | null;
}

/** The type parameter names of one declaration, linked to those of the declaration around it. */
interface TypeParameters { readonly names: ReadonlySet<string>; readonly outer: TypeParameters | null }

/** One block namespace: the declaration, the dotted block-namespace prefix up to and including it, and the memoised readings that depend only on it. */
interface NsFrame {
  readonly decl: Node;
  readonly joined: string;
  readonly outer: NsFrame | null;
  /** The enclosing-namespace chain of a node directly in this namespace, innermost first, with and without the file-scoped namespace in front. */
  chainWithFile?: string[];
  chainPlain?: string[];
  /** What the namespace's own using directives say, as an outer namespace of a directive (see `nsEntry`): undefined until read, null when it has none. */
  entry?: OuterUsings | null;
  /** The outer usings of a directive that sits directly in this namespace's body (see `outerList`). */
  outerList?: OuterUsings[];
}

const TOP_SCOPE: CsScope = { ns: null, chain: '', bodyChain: '', typeDecl: null, fileLocal: false, tp: null, tpSkip: undefined, nameof: false, extBelow: false, access: null, tuple: null };

/** The scope the node is read in: its parent's scope, except that an attribute list of a declaration does not see that declaration's type parameters. */
function csSeen(node: Node, inherited: CsScope): CsScope {
  if (inherited.tpSkip === undefined) return inherited;
  return { ...inherited, tp: node.type === 'attribute_list' ? inherited.tpSkip : inherited.tp, tpSkip: undefined };
}

/** The scope the children of `node` inherit, or undefined when it is `own`. */
function csBelow(node: Node, own: CsScope, parentOf: ParentOf): CsScope | undefined {
  const type = node.type;
  let { ns, chain, bodyChain, typeDecl, fileLocal, tp, nameof, extBelow } = own;
  let tpSkip: TypeParameters | null | undefined;
  let changed = false;
  if (type === 'namespace_declaration') {
    const name = node.childForFieldName('name')?.text ?? '';
    const outerJoined = own.ns?.joined ?? '';
    ns = { decl: node, joined: name === '' ? outerJoined : outerJoined === '' ? name : `${outerJoined}.${name}`, outer: own.ns };
    changed = true;
  }
  if (TYPE_DECLARATION_TYPES.has(type)) {
    const name = declaredTypeName(node);
    if (name !== '') chain = chain === '' ? name : `${chain}+${name}`;
    fileLocal = own.fileLocal || hasFileModifier(node);
    typeDecl = { node, nested: own.typeDecl !== null, fileLocal, seen: typeSeen(node, own.typeDecl) };
    extBelow = false;
    changed = true;
  }
  // The body of a type declaration (`declaration_list`, or an enum's member list): only inside it are the type's members, its nested types included, in scope.
  if (type === 'declaration_list' || type === 'enum_member_declaration_list') {
    const parent = parentOf();
    if (parent !== null && TYPE_DECLARATION_TYPES.has(parent.type)) {
      bodyChain = chain;
      changed = true;
    }
  }
  if (type === 'extension_declaration') {
    extBelow = true;
    changed = true;
  }
  if (TYPE_PARAMETER_OWNERS.has(type)) {
    const names = typeParameterNames(node);
    if (names.size > 0) tp = { names, outer: own.tp };
    tpSkip = own.tp;
    changed = true;
  }
  if (type === 'invocation_expression') {
    const fn = node.childForFieldName('function');
    if (fn !== null && fn.type === 'identifier' && fn.text === 'nameof') {
      nameof = true;
      changed = true;
    }
  }
  const access = type === 'member_access_expression' ? { node, outer: own.access } : null;
  let tuple: CsScope['tuple'] = null;
  if (type === 'tuple_expression') tuple = { stage: 'tuple', root: own.tuple?.stage === 'arg' ? own.tuple.root : node };
  else if (type === 'argument' && own.tuple?.stage === 'tuple') tuple = { stage: 'arg', root: own.tuple.root };
  if (access !== null || own.access !== null || tuple !== null || own.tuple !== null) changed = true;
  return changed ? { ns, chain, bodyChain, typeDecl, fileLocal, tp, tpSkip, nameof, extBelow, access, tuple } : undefined;
}

/** The names the `type_parameter_list` of a declaration declares (none when it has no list). */
function typeParameterNames(decl: Node): Set<string> {
  const names = new Set<string>();
  for (const list of decl.namedChildren) {
    if (list === null || list.type !== 'type_parameter_list') continue;
    for (const tp of list.namedChildren) {
      const name = tp?.childForFieldName('name')?.text;
      if (name !== undefined) names.add(name);
    }
    break;
  }
  return names;
}

/** Walk the tree with the scope of every node (see `CsScope`); a visitor that returns `false` skips the children of the node it was given. */
function walkCs(root: Node, visit: (node: Node, scope: CsScope, parentOf: ParentOf) => boolean | undefined): void {
  walkScoped<CsScope>(root, TOP_SCOPE, (node, inherited, parentOf) => {
    const own = csSeen(node, inherited);
    if (visit(node, own, parentOf) === false) return false;
    return csBelow(node, own, parentOf) ?? (own === inherited ? undefined : own);
  });
}

/** The scope of every node of a file, by node id, for the helpers that are handed a node a few levels under the one the walk is at. */
function csIndex(root: Node): Map<number, CsScope> {
  return indexScopes<CsScope>([root], TOP_SCOPE, csBelow, csSeen);
}

/** The dotted BLOCK-namespace prefix of a scope. Nested `namespace A { namespace B { } }` concatenates outermost-first → "A.B". Empty when there is no block namespace around (the type may still sit in a file-scoped namespace). */
function blockNamespace(scope: CsScope): string {
  return scope.ns?.joined ?? '';
}

/** True when a `*_declaration` node carries the C#11 `file` modifier — a child `modifier`
 *  node whose text is the keyword `file`. A `file`-modified type is visible ONLY inside its
 *  declaring source file (it cannot be referenced cross-file, and two different files may each
 *  declare an unrelated same-named `file` type). */
function hasFileModifier(node: Node): boolean {
  for (const c of node.children) {
    if (c !== null && c.type === 'modifier' && c.text === 'file') return true;
  }
  return false;
}

/** True when `node` is a `file`-local type OR is nested (at any depth) inside a `file`-local
 *  type. A type unreachable across files because an enclosing type is `file`-local must also be
 *  withheld from the cross-file index — a nested type of a `file` type cannot escape the file. */
function isFileLocalType(node: Node, scope: CsScope): boolean {
  return scope.fileLocal || (TYPE_KEY_DECLARATION_TYPES.has(node.type) && hasFileModifier(node));
}

/**
 * The symbol key of an EXTENSION METHOD named `name` declared in namespace `ns`: `<ns>.<name>()`
 * (`<name>()` in the global namespace). C# binds an extension-method call `x.Name()` by the
 * method NAME among the extension methods of the namespaces in scope (the enclosing namespaces
 * and the imported ones) — the declaring static class is not part of the lookup, so it is not
 * part of the key. The trailing `()` puts these keys in a string space no type key or type-use
 * candidate can ever produce (a type name never contains parentheses), so an extension key can
 * never be mistaken for, or silence, a type.
 */
function extensionKey(ns: string, name: string): string {
  return ns === '' ? `${name}()` : `${ns}.${name}()`;
}

/**
 * The symbol key of an extension method `name` in its static class `classKey` (the class's own type key, `<ns>.<Class>`): `<ns>.<Class>#<name>()`. A `using static` directive imports the extension methods of the one class it names, which the namespace's key (`extensionKey`) cannot tell from those of the other classes of the namespace. The `#` is in no C# name, so no namespace can spell this key, whatever a repository calls its namespaces and classes.
 */
function classExtensionKey(classKey: string, name: string): string {
  return `${classKey}#${name}()`;
}

/**
 * The symbol key of the class the compiler synthesizes for a file of top-level statements. That class is the global `Program`, but it is published under this separate key so that it only ever acts as a FALLBACK: a bare `Program` reference tries every explicit reading first (the enclosing namespaces, the usings, and the verbatim global `Program`, which a `public partial class Program { }` declares) and reaches this key last. An explicit global `Program` anywhere therefore binds before any implicit one, and only when none is declared do the implicit classes count (one owner gives the edge, several give silence). A resolver given the reference graph (`ResolverDeps.reach`) reads the explicit and the implicit class as ONE name instead, as the compiler does, and chooses among those the referencing project can see, as long as the graph can say something about each of them. `<Program>$` is the name the compiler gave the class before C# 10; no C# source can write it, so no type key or use candidate other than that fallback can ever produce it.
 */
export const IMPLICIT_PROGRAM_KEY = '<Program>$';

/**
 * The marker key of a declaration only its own assembly sees: `internal:<key>`, declared beside `<key>` by the same file. A type whose effective accessibility stops at its assembly (`internal`, `private`, `private protected`, a top-level type with no access modifier, which C# makes internal, or a type nested in one of those), and an extension method that is not public or whose static class is not, carry it; a resolver given the reference graph drops such a definer for a caller of another compilation unless the defining project grants that caller its internals (`InternalsVisibleTo`). The colon puts the key in a string space no C# name can produce. A `partial` type part without an access modifier is not marked, since another part may make it public: the resolver reads it as internal where a part of the same compilation is marked.
 */
export function internalKey(symbolKey: string): string {
  return `internal:${symbolKey}`;
}

/**
 * The head of the key that records one base of the type `typeKey`: `base:<key>`. A type declaration with a base list declares, for each base it lists, the key `base:<key>\t<value>`, the value (`encodeWritten`) holding where the base's name is written and the name. The symbol table lists such a key under its head (`SymbolTable.valuesOf`) and never as a name, and every part of a partial type adds its own. The colon and the tab are in no C# name.
 */
export function baseListKey(typeKey: string): string {
  return `base:${typeKey}`;
}

/** The head of the key that records one base of a C#11 `file` type of the key `typeKey`: `file-base:<key>`, with a value like a base record's. Such a type has no published key and belongs to its file alone, so its bases are kept apart from those of a published type of the same name, and each record is read only for the `file` type of a file that declares it (`fileTypeRef`): a published type, or a `file` type of another file, may share the key and is another type. */
export function fileBaseListKey(typeKey: string): string {
  return `file-base:${typeKey}`;
}

/** What leads the key of a C#11 `file` type where a reading names the type whose body holds it (`fileTypeRef`). The colon is in no C# name, so no published key starts with it. */
export const FILE_TYPE_REF = 'file:';

/** The key `typeKey` as a reading written inside the `file` type of that key names it: `file:<key>`, in `TargetHint.within` and in the type lists of a `CsharpCondition`. A published type, or a `file` type of another file, may have the same full name, so the reading says which it stands in, and the resolver reads for it what the referencing file alone records: its `file-base:` records, and nothing recorded under the published key. */
export function fileTypeRef(typeKey: string): string {
  return `${FILE_TYPE_REF}${typeKey}`;
}

/** The key a type reference of a reading names: the reference itself, or the key behind the mark of a `file` type (`fileTypeRef`). */
export function referencedTypeKey(ref: string): string {
  return ref.startsWith(FILE_TYPE_REF) ? ref.slice(FILE_TYPE_REF.length) : ref;
}

/** The head of the key that records the using directives of a file: `usings`. A file that records a written type (`encodeWritten`) declares `usings\t<value>` once, the value (`encodeUsings`) holding what a name written in that file is read with, so each record holds a name and no reading of its own. */
export const USINGS_KEY = 'usings';

/** The marker key of an interface: `interface:<key>`, declared beside the type key of every interface declaration. A class inherits the nested types of its base class and of no interface it implements, and the base list of a class does not say which of its names is which. */
export function interfaceKey(typeKey: string): string {
  return `interface:${typeKey}`;
}

/** The head of the key that records the instance methods of the type `typeKey`: `methods:<key>`. A part of a type that declares any declares `methods:<key>\t<value>` once, the value (`decodeMethods`) listing each overload by name, shape (`methodShape`) and reach, listed under the head like a base record (`baseListKey`). A static method, an explicit interface implementation (callable through the interface alone) and an extension method are not listed, and a private method only in a `partial` type, whose other parts can call it. The colon is in no C# name. */
export function methodsKey(typeKey: string): string {
  return `methods:${typeKey}`;
}

/** One instance method of a type as its record lists it: `reach` says who can call it, any code (`public`, which stands for `internal` and `protected internal` too: an assembly is not told apart here), the type and the types derived from it (`protected`), or the type alone (`private`). */
export interface CsharpMethod { name: string; shape: string; reach: 'public' | 'protected' | 'private' }

const METHOD_REACH_MARKS = { public: '', protected: '~', private: '-' } as const;

/** The methods a `methods` record's value lists: entries `<mark><name>:<shape>` joined by a space, the mark `~` for a protected method and `-` for a private one. */
export function decodeMethods(value: string): CsharpMethod[] {
  return value.split(' ').map((entry) => {
    const reach = entry.startsWith('~') ? 'protected' : entry.startsWith('-') ? 'private' : 'public';
    const body = reach === 'public' ? entry : entry.slice(1);
    const colon = body.indexOf(':');
    return { name: body.slice(0, colon), shape: body.slice(colon + 1), reach };
  });
}

/** Who can call the instance method `method` of the type declaration `owner` (see `CsharpMethod`). */
function methodReach(method: Node, owner: Node): CsharpMethod['reach'] {
  const mods = accessModifiers(method);
  if (mods.has('protected')) return mods.has('internal') ? 'public' : 'protected';
  if (mods.has('private')) return 'private';
  return mods.has('public') || mods.has('internal') || owner.type === 'interface_declaration' ? 'public' : 'private';
}

/** How many type arguments and arguments a method takes, as far as its declaration says without its types: `<type parameters>:<required parameters>:<all parameters>`, the last `*` for a `params` list. */
function methodShape(method: Node): string {
  const list = method.childForFieldName('parameters')!;
  let required = 0;
  let all = 0;
  let open = hasTokenChild(list, 'params');
  for (const param of list.namedChildren) {
    if (param!.type !== 'parameter') {
      open = true;
      continue;
    }
    all++;
    if (!hasTokenChild(param!, '=')) required++;
  }
  return `${typeParameterNames(method).size}:${required}:${open ? '*' : all}`;
}

/** True when a call with `typeArguments` written type arguments and `args` arguments can be a call of a method of the shape `shape` (`methodShape`): the counts fit. A call without type arguments fits a generic method too, whose type arguments the compiler infers. */
export function shapeTakes(shape: string, typeArguments: number, args: number): boolean {
  const [typeParameters, required, all] = shape.split(':');
  if (typeArguments > 0 && Number(typeParameters) !== typeArguments) return false;
  return args >= Number(required) && (all === '*' || args <= Number(all));
}

/** The head of the key that records the members of the type `typeKey` that are no types: `members:<key>`. A part of a type declares `members:<key>\t<value>` once, the value (`decodeMembers`) listing each field, constant, property, event and method by name, static ones included, and the written type of a field or a property. C# reads the members of the types around a simple name, inherited ones included, before any namespace (spec §12.8.4), so such a name is that member and no type of a namespace. Only a type whose members code outside its declaration can read by a simple name lists them (`givesMembers`), a private member only in a `partial` type, and a field or a property named as its own type (`Color Color`) never: where a type fits, C# reads that name as the type (spec §12.8.7.2). */
export function membersKey(typeKey: string): string {
  return `members:${typeKey}`;
}

/** One member of a type as its record lists it: `hidden` for a private one (and for a primary constructor parameter of a class or a struct), which every part of the type sees and no derived type does; `type` the written type of a field or a property that names one (`CsharpWritten`). */
export interface CsharpMember { name: string; hidden: boolean; type?: CsharpWritten }

/** The members a `members` record's value lists: entries `<name>` or `<name>=<offset>:<type name>` joined by a space, a hidden one led by `-`. */
export function decodeMembers(value: string): CsharpMember[] {
  return value.split(' ').map((entry) => {
    const hidden = entry.startsWith('-');
    const body = hidden ? entry.slice(1) : entry;
    const equals = body.indexOf('=');
    return equals === -1 ? { name: body, hidden } : { name: body.slice(0, equals), hidden, type: decodeWritten(body.slice(equals + 1)) };
  });
}

/** True when a declaration node carries the modifier `text`. */
function hasModifier(node: Node, text: string): boolean {
  for (const c of node.children) {
    if (c !== null && c.type === 'modifier' && c.text === text) return true;
  }
  return false;
}

/** True when code outside the type declaration `decl` can read its members by a simple name: another part of it (`partial`), or a type derived from it (an interface, or a class or a record that is neither static nor sealed). */
function givesMembers(decl: Node): boolean {
  if (hasModifier(decl, 'partial') || decl.type === 'interface_declaration') return true;
  return (decl.type === 'class_declaration' || decl.type === 'record_declaration') && !hasModifier(decl, 'static') && !hasModifier(decl, 'sealed');
}

/** True when a simple name inside the type declaration `decl` can be a member the declaration does not hold: one of another part (`partial`), or one a base it lists hands down. */
function takesMembers(decl: Node): boolean {
  return decl.type !== 'enum_declaration' && (hasModifier(decl, 'partial') || decl.namedChildren.some((c) => c!.type === 'base_list'));
}

/** The last simple name of a written type (`Lib.Color` and `Color?` are `Color`), or undefined for a type that is no single name. A member named as its own type (`Color Color`) is read as the type wherever a type fits (C# spec §12.8.7.2). */
function typeSimpleName(typeNode: Node | null): string | undefined {
  if (typeNode === null) return undefined;
  switch (typeNode.type) {
    case 'identifier':
      return typeNode.text;
    case 'nullable_type':
      return typeSimpleName(typeNode.childForFieldName('type'));
    case 'qualified_name':
    case 'alias_qualified_name':
      return typeSimpleName(typeNode.childForFieldName('name'));
    default:
      return undefined;
  }
}

/** The written type of a field, event or property declaration, or null for any other member. */
function memberTypeNode(member: Node): Node | null {
  if (member.type === 'property_declaration') return member.childForFieldName('type');
  if (member.type !== 'field_declaration' && member.type !== 'event_field_declaration') return null;
  return member.namedChildren.find((c) => c!.type === 'variable_declaration')?.childForFieldName('type') ?? null;
}

/** The declarations that give a type a member a simple name can read (see `memberNames`). */
const MEMBER_DECLARATION_TYPES = new Set(['method_declaration', 'property_declaration', 'event_declaration', 'field_declaration', 'event_field_declaration']);

/** The names a member declaration gives its type, with the declaration that says how far they are seen; none for a declaration that names no member a simple name can read (an explicit interface implementation, an indexer, an operator, a nested type, which has a key of its own). */
function memberNames(node: Node): string[] {
  if (node.type !== 'field_declaration' && node.type !== 'event_field_declaration') {
    // A method, a property or an event (`MEMBER_DECLARATION_TYPES`): its own name.
    return node.namedChildren.some((c) => c!.type === 'explicit_interface_specifier') ? [] : [node.childForFieldName('name')!.text];
  }
  const names: string[] = [];
  for (const declaration of node.namedChildren) {
    if (declaration!.type !== 'variable_declaration') continue;
    for (const d of declaration!.namedChildren) {
      const name = d!.type === 'variable_declarator' ? d!.childForFieldName('name') : null;
      if (name !== null && name.type === 'identifier') names.push(name.text);
    }
  }
  return names;
}

/** True when a member declaration is private: it says `private` without `protected`, or it carries no access modifier in a class, struct or record, where that is the default (a member of an interface is public by default). */
function isPrivateMember(member: Node, owner: Node): boolean {
  const mods = accessModifiers(member);
  if (mods.has('private')) return !mods.has('protected');
  return !mods.has('public') && !mods.has('internal') && !mods.has('protected') && owner.type !== 'interface_declaration';
}

/** A type name as a record holds it: `at`, where the name is written in its file (which says which using directives of a namespace block reach it), and `name`, the name with its type arguments as their arity: `Base`, ``Repo`1``, `Lib.Base`, `global::Lib.Base` for a rooted one, `S::Thing` for one led by a using alias, and the empty string for a name that is no reference (a type parameter). */
export interface CsharpWritten { at: number; name: string }

/** The value of a record of a written type (see `baseListKey`). */
export function encodeWritten(written: CsharpWritten): string {
  return `${written.at}:${written.name}`;
}

/** The written type a record's value holds (see `encodeWritten`). */
export function decodeWritten(value: string): CsharpWritten {
  const colon = value.indexOf(':');
  return { at: Number(value.slice(0, colon)), name: value.slice(colon + 1) };
}

/** What a written type of a file is read with: the file's using scope, as far as the readings need it, and the keys of the types the file keeps to itself. */
export type CsharpUsings = Pick<CsharpExtract, 'scope' | 'fileLocalTypes'>;

/** The value of a file's `usings` record (see `USINGS_KEY`): the using directives the readings of a name depend on, an empty list left out. A directive of the compilation unit is its namespace or type alone; one in a namespace block keeps its block. */
export function encodeUsings({ scope, fileLocalTypes }: CsharpUsings): string {
  const record: Record<string, unknown> = {
    prefixes: scope.prefixDecls.map((d) => (d.body.length === 0 ? d.ns : d)),
    global: scope.globalPrefixes,
    aliases: [...scope.aliasDecls],
    statics: scope.staticDecls.map((d) => (d.body.length === 0 ? d.fqn : d)),
    globalStatics: scope.globalStatics,
    local: fileLocalTypes,
  };
  for (const key of Object.keys(record)) if ((record[key] as unknown[]).length === 0) delete record[key];
  return JSON.stringify(record);
}

/** The using scope a `usings` record's value holds (see `encodeUsings`). */
export function decodeUsings(value: string): CsharpUsings {
  const record = JSON.parse(value) as {
    prefixes?: Array<string | UsingScope['prefixDecls'][number]>;
    global?: string[];
    aliases?: Array<[string, NonNullable<ReturnType<UsingScope['aliasDecls']['get']>>]>;
    statics?: Array<string | UsingScope['staticDecls'][number]>;
    globalStatics?: string[];
    local?: string[];
  };
  const prefixDecls = (record.prefixes ?? []).map((d) => (typeof d === 'string' ? { ns: d, rooted: false, body: [], start: 0, end: 0 } : d));
  const staticDecls = (record.statics ?? []).map((d) => (typeof d === 'string' ? { fqn: d, rooted: false, body: [], start: 0, end: 0 } : d));
  const aliasDecls = new Map(record.aliases ?? []);
  const aliases = new Map<string, string>();
  for (const [name, decls] of aliasDecls) aliases.set(name, decls[decls.length - 1].fqn);
  return {
    scope: { prefixes: prefixDecls.map((d) => d.ns), globalPrefixes: record.global ?? [], aliases, globalAliases: new Map(), aliasDecls, prefixDecls, staticTargets: [], staticDecls, globalStatics: record.globalStatics ?? [] },
    fileLocalTypes: record.local ?? [],
  };
}

/**
 * The readings of a written type of a record, in C# lookup order where it is written: `holder` is the key of the type that writes it, in its base list or, with `inBody`, as the type of one of its members, and `usings` what its file reads names with. The namespaces and the types around the name are those of `holder` itself; the project's own scope (a global using of another file) takes no part.
 */
export function writtenReadings(written: CsharpWritten, holder: string, inBody: boolean, usings: CsharpUsings): SymbolHint[] {
  if (written.name === '') return [];
  const plus = holder.indexOf('+');
  const dot = (plus === -1 ? holder : holder.slice(0, plus)).lastIndexOf('.');
  const ns = dot === -1 ? '' : holder.slice(0, dot);
  const enclosingNs: string[] = [];
  for (let end = ns.length; end > 0; end = ns.lastIndexOf('.', end - 1)) enclosingNs.push(ns.slice(0, end));
  // The types whose bodies hold the name, innermost first: a base list lies outside the body of its own type.
  const types: string[] = [];
  for (let end = holder.length; end > dot && end !== -1; end = holder.lastIndexOf('+', end - 1)) types.push(holder.slice(0, end));
  if (!inBody) types.shift();
  const place = { line: 0, enclosingNs, at: written.at };
  const alias = written.name.indexOf('::');
  const ref: CsharpRefDescriptor = written.name.startsWith('global::')
    ? { kind: 'plain', ref: written.name.slice('global::'.length), rooted: true, ...place }
    : alias !== -1
      ? { kind: 'alias', aliasName: written.name.slice(0, alias), tail: written.name.slice(alias + 2), ...place }
      : { kind: 'plain', ref: written.name, rooted: false, ...place, ...(types.length > 0 ? { types } : {}) };
  return (assembleCsharpCandidates({ fileNs: '', ...usings, refs: [ref] })[0]?.candidates ?? []) as SymbolHint[];
}

/** The name a type node writes, as a record holds it (`CsharpWritten.name`), or undefined for a type that is no single name (a predefined type, an array, a tuple); the empty string for a type parameter in scope (`typeParameters` adds those of a declaration whose own header writes the name). */
function writtenName(typeNode: Node, scope: CsScope, typeParameters?: ReadonlySet<string>): string | undefined {
  const dotted = (node: Node): string | undefined => {
    switch (node.type) {
      case 'identifier':
        return node.text;
      case 'generic_name':
        return genericKey(node);
      case 'qualified_name': {
        const head = dotted(node.childForFieldName('qualifier')!);
        const tail = dotted(node.childForFieldName('name')!);
        return head === undefined || tail === undefined ? undefined : `${head}.${tail}`;
      }
      case 'alias_qualified_name': {
        const name = dotted(node.childForFieldName('name')!);
        return name === undefined ? undefined : `${node.childForFieldName('alias')!.text}::${name}`;
      }
      default:
        return undefined;
    }
  };
  if (typeNode.type === 'nullable_type') return writtenName(typeNode.childForFieldName('type')!, scope, typeParameters);
  if (typeNode.type === 'identifier' && (isTypeParameterInScope(typeNode.text, scope) || typeParameters?.has(typeNode.text) === true)) return '';
  return dotted(typeNode);
}

/** The declarations that may list bases other types inherit through: an enum's list names its underlying type. */
const BASE_LIST_OWNERS = new Set(['class_declaration', 'interface_declaration', 'struct_declaration', 'record_declaration', 'record_struct_declaration']);

/** The access modifiers a declaration node carries. */
function accessModifiers(node: Node): Set<string> {
  const out = new Set<string>();
  for (const c of node.children) {
    if (c !== null && c.type === 'modifier' && /^(?:public|internal|protected|private|partial)$/.test(c.text)) out.add(c.text);
  }
  return out;
}

/** How far a type is seen: by other assemblies (`open`), by its own assembly only (`assembly`), or not known from this part (`unknown`: a `partial` part without an access modifier, or a type nested in one). */
type TypeSeen = 'open' | 'assembly' | 'unknown';

/** How far the type declaration `node` is seen, given the type declaration around it (`outer`, null at the top level). It is seen by its own assembly only when it, or a type around it, is `internal`, `private` or `private protected`, or has no access modifier where the default is internal (a top-level type) or private (a type nested in a class, struct or record); a type nested in an interface is public by default. */
function typeSeen(node: Node, outer: CsScope['typeDecl']): TypeSeen {
  if (outer !== null && outer.seen === 'assembly') return 'assembly';
  const mods = accessModifiers(node);
  let own: TypeSeen;
  if (mods.has('public') || (mods.has('protected') && !mods.has('private'))) own = 'open';
  else if (mods.has('internal') || mods.has('private')) own = 'assembly';
  else if (mods.has('partial')) own = 'unknown';
  else own = outer !== null && outer.node.type === 'interface_declaration' ? 'open' : 'assembly';
  return own === 'open' && outer !== null && outer.seen === 'unknown' ? 'unknown' : own;
}

/** True when an extension method is seen by its own assembly only: the method is not public (or protected), or its static class is seen by its assembly only. A method of the misread C# 14 block form is judged by its class alone. */
function assemblyOnlyExtension(node: Node, owner: NonNullable<CsScope['typeDecl']>): boolean {
  if (node.type === 'method_declaration') {
    const mods = accessModifiers(node);
    if (!mods.has('public') && !(mods.has('protected') && !mods.has('private'))) return true;
  }
  return owner.seen === 'assembly';
}

/** The first top-level statement of a C# file (a `global_statement` child of the compilation unit), or undefined when the file has none. */
function firstTopLevelStatement(root: Node): Node | undefined {
  return root.namedChildren.find((c): c is Node => c?.type === 'global_statement');
}

/** True when `node` has a `static` modifier child. */
function hasStaticModifier(node: Node): boolean {
  for (const c of node.children) {
    if (c !== null && c.type === 'modifier' && c.text === 'static') return true;
  }
  return false;
}

/** True when a parameter carries the `this` modifier (the receiver of a classic extension method). */
function isThisParameter(param: Node): boolean {
  for (const c of param.children) {
    if (c !== null && c.type === 'modifier' && c.text === 'this') return true;
  }
  return false;
}

/** The declarations that may carry a type-parameter list: a generic type (`class Repository<T>`), method, local function, delegate, or C# 14 extension block. */
const TYPE_PARAMETER_OWNERS = new Set([
  ...TYPE_DECLARATION_TYPES,
  'method_declaration',
  'local_function_statement',
  'delegate_declaration',
  'extension_declaration',
]);

/**
 * True when the bare name `name`, written where the scope `scope` holds, names a type parameter in scope there. C# looks a simple name without type arguments up among the type parameters of the enclosing generic declarations before any member, namespace or using (§7.6.1), so inside `class Repository<Entity>` or `T Resolve<T>()` such a name is never a type of the repository, whatever an imported namespace declares. A type parameter's scope is its whole declaration except the declaration's own attributes (`[A(typeof(T))] class C<T>` names an outer `T`). A name with type arguments (`Entity<int>`) never names a type parameter, so only bare names are asked about; a qualified name cannot start with a type parameter in valid C# (CS0704), and a member access through one (`T.Create()`) is no receiver because the receiver reading asks this function too.
 */
function isTypeParameterInScope(name: string, scope: CsScope): boolean {
  for (let t = scope.tp; t !== null; t = t.outer) if (t.names.has(name)) return true;
  return false;
}

/**
 * The name of the extension method `node` declares, or undefined when it declares none. Three
 * shapes are recognised, each inside a TOP-LEVEL (non-nested) `static` class that is not
 * `file`-local — the only place C# allows extension members:
 *  - the classic form: a `method_declaration` whose first parameter carries `this`;
 *  - a C# 14 extension-block member on a grammar that knows the block: a `method_declaration`
 *    whose ancestor is an `extension_declaration`;
 *  - the same member on the shipped pre-C# 14 grammar, which misreads the block as a constructor
 *    named `extension` and its methods as local functions in that constructor's body.
 * Indexing the last shape only ever ADDS a key; nothing else depends on the misreading.
 */
function extensionMethodName(node: Node, scope: CsScope): string | undefined {
  if (node.type !== 'method_declaration' && node.type !== 'local_function_statement') return undefined;
  const decl = scope.typeDecl;
  const owner = decl?.node;
  if (decl === null || owner === undefined || owner.type !== 'class_declaration' || !hasStaticModifier(owner) || decl.fileLocal || decl.nested) {
    return undefined;
  }
  const name = node.childForFieldName('name')!.text; // a method / local function always has a name
  if (node.type === 'local_function_statement') {
    // Only a local function DIRECTLY in the body of the misread `extension(…)` constructor of the
    // static class itself; a local function anywhere else is a helper, never an extension member.
    const ctor = node.parent!.parent!;
    const misreadBlock =
      ctor.type === 'constructor_declaration' && ctor.childForFieldName('name')!.text === 'extension' && ctor.parent!.parent!.id === owner.id;
    return misreadBlock ? name : undefined;
  }
  // The C# 14 block form on a grammar that knows it: a method inside an extension declaration.
  if (scope.extBelow) return name;
  // The classic form: the first parameter carries `this`.
  const first = node.childForFieldName('parameters')!.namedChild(0);
  return first?.type === 'parameter' && isThisParameter(first) ? name : undefined;
}

/** The key a type declaration `node` declares, read in `scope` of a file whose file-scoped namespace is `fileNs` (see `declarations`), or undefined for one that has no name. */
function declaredTypeKey(node: Node, scope: CsScope, fileNs: string): string | undefined {
  const nameField = node.childForFieldName('name');
  if (nameField === null || nameField.text === '') return undefined;
  const ns = [fileNs, blockNamespace(scope)].filter((p) => p !== '').join('.');
  const own = declaredTypeName(node);
  const typeKey = scope.chain === '' ? own : `${scope.chain}+${own}`;
  return ns === '' ? typeKey : `${ns}.${typeKey}`;
}

/** The keys of the types the file declares but keeps to itself: the C#11 `file` types and the types nested in them. Inside the file they are found by their names like any other type, and, found at a lookup level, they remove the public types of that level (the C# 11 file-local types proposal, Lookup). */
function fileLocalTypeKeys(root: Node, fileNs: string): string[] {
  const keys: string[] = [];
  walkCs(root, (node, scope) => {
    if (!TYPE_KEY_DECLARATION_TYPES.has(node.type) || !isFileLocalType(node, scope)) return undefined;
    const key = declaredTypeKey(node, scope, fileNs);
    if (key !== undefined) keys.push(key);
    return undefined;
  });
  return keys;
}

/**
 * The FULLY-QUALIFIED symbol keys this file DEFINES. The namespace for each type is the
 * file-scoped namespace (if any) joined with the block-namespace ancestor chain. The TYPE
 * part is the enclosing-type chain joined by the reflection separator `+`, ending in the
 * type's own simple name: a top-level type is `<namespace>.<TypeName>`; a nested type is
 * `<namespace>.<Outer>+<Inner>` (deeper: `<Outer>+<Mid>+<Inner>`); at true file scope the
 * namespace prefix is omitted (`<TypeName>` or `<Outer>+<Inner>`). A nested type emits ONLY
 * its `+` key — never also the bare simple name — so it cannot collide with, and silence, a
 * legitimate top-level type of the same simple name in another node. These keys feed the
 * shared SymbolTable; a use's `Outer.Inner` reference resolves to them via the resolver's
 * guarded `+`-boundary split.
 *
 * A C#11 `file`-local type (and anything nested inside one) is NEVER published to the shared
 * cross-file index: it is visible only in its own file, so a cross-file reference to a
 * same-named type must never bind to it, and two files declaring same-named `file` types must
 * not mis-merge into one cross-file definition (zero-FP guard F5).
 *
 * A file with top-level statements also declares the class the compiler synthesizes for them, the global `Program`, under a fallback key that an explicit global `Program` always outranks (IMPLICIT_PROGRAM_KEY).
 */
function declarations(file: ParsedFile): DeclaredSymbol[] {
  const out: DeclaredSymbol[] = [];
  const fileNs = fileScopedNamespace(file.tree.rootNode);
  // The instance methods of each type of the file, by type key (see `methodsKey`).
  const methods = new Map<string, { line: number; entries: Set<string> }>();
  // The members of each type of the file that are no types, by type key (see `membersKey`).
  const listedMembers = new Map<string, { line: number; entries: Set<string> }>();
  const listMember = (typeKey: string, owner: Node, entry: string): void => {
    let listed = listedMembers.get(typeKey);
    if (listed === undefined) listedMembers.set(typeKey, (listed = { line: owner.startPosition.row + 1, entries: new Set() }));
    listed.entries.add(entry);
  };
  // Set once a record of a written type is declared: the file then declares its using directives too.
  let written = false;
  const fileLocalTypes: string[] = [];
  const record = (head: string, typeNode: Node | null, scope: CsScope, line: number, typeParameters?: ReadonlySet<string>): void => {
    const name = typeNode === null ? undefined : writtenName(typeNode, scope, typeParameters);
    if (name === undefined) return;
    written = true;
    out.push({ symbolKey: `${head}\t${encodeWritten({ at: typeNode!.startIndex, name })}`, line });
  };

  walkCs(file.tree.rootNode, (node, scope, parentOf) => {
    const owner = scope.typeDecl;
    const line = node.startPosition.row + 1;
    // The members of a type other files can name, declared directly in its body: each name that is no type (see `membersKey`), and each instance method (see `methodsKey`).
    // Such a declaration stands in the body of a type and nowhere else, so the nearest type around it is its own.
    if (owner !== null && MEMBER_DECLARATION_TYPES.has(node.type) && !owner.fileLocal && owner.node.type !== 'enum_declaration') {
      const ns = [fileNs, blockNamespace(scope)].filter((p) => p !== '').join('.');
      const typeKey = ns === '' ? scope.chain : `${ns}.${scope.chain}`;
      const hidden = isPrivateMember(node, owner.node);
      const typeNode = memberTypeNode(node);
      const listsIt = givesMembers(owner.node) && (!hidden || hasModifier(owner.node, 'partial'));
      for (const name of memberNames(node)) {
        if (listsIt && name !== typeSimpleName(typeNode)) {
          const typeName = typeNode === null ? undefined : writtenName(typeNode, scope);
          if (typeName !== undefined && typeName !== '') written = true;
          listMember(typeKey, owner.node, `${hidden ? '-' : ''}${name}${typeName === undefined || typeName === '' ? '' : `=${encodeWritten({ at: typeNode!.startIndex, name: typeName })}`}`);
        }
        if (node.type === 'method_declaration' && !hasStaticModifier(node)) {
          const reach = methodReach(node, owner.node);
          if (reach !== 'private' || accessModifiers(owner.node).has('partial')) {
            let listed = methods.get(typeKey);
            if (listed === undefined) methods.set(typeKey, (listed = { line: owner.node.startPosition.row + 1, entries: new Set() }));
            listed.entries.add(`${METHOD_REACH_MARKS[reach]}${name}:${methodShape(node)}`);
          }
        }
      }
    }
    // The parameters of a primary constructor: a record's are its public properties, a class's or a struct's are seen by every part of the type and by no other.
    // A primary constructor's list is the type's own child, in its header (outside its body); the type is asked for only there.
    if (node.type === 'parameter' && owner !== null && !owner.fileLocal && scope.bodyChain !== scope.chain && parentOf()!.parent!.id === owner.node.id) {
      const name = node.childForFieldName('name');
      const ns = [fileNs, blockNamespace(scope)].filter((p) => p !== '').join('.');
      const typeKey = ns === '' ? scope.chain : `${ns}.${scope.chain}`;
      const property = owner.node.type.startsWith('record');
      if (name !== null && givesMembers(owner.node) && (property || hasModifier(owner.node, 'partial'))) listMember(typeKey, owner.node, `${property ? '' : '-'}${name.text}`);
      return undefined;
    }
    const extName = extensionMethodName(node, scope);
    if (extName !== undefined) {
      const ns = [fileNs, blockNamespace(scope)].filter((p) => p !== '').join('.');
      const line = node.startPosition.row + 1;
      const assemblyOnly = assemblyOnlyExtension(node, scope.typeDecl!);
      // The key of the method in its namespace (`extensionKey`), and the key it has in its class: `using static T;` imports the extension methods of T alone.
      const className = declaredTypeName(scope.typeDecl!.node);
      for (const symbolKey of [extensionKey(ns, extName), classExtensionKey(ns === '' ? className : `${ns}.${className}`, extName)]) {
        out.push({ symbolKey, line });
        if (assemblyOnly) out.push({ symbolKey: internalKey(symbolKey), line });
      }
      return undefined;
    }
    if (!TYPE_KEY_DECLARATION_TYPES.has(node.type)) return undefined;
    const symbolKey = declaredTypeKey(node, scope, fileNs);
    if (symbolKey === undefined) return undefined;
    // C#11 `file`-local type → not a cross-file resolution target. Skip publishing its FQN; its base list is recorded apart (`fileBaseListKey`).
    const fileLocal = isFileLocalType(node, scope);
    if (fileLocal) fileLocalTypes.push(symbolKey);
    else {
      out.push({ symbolKey, line: node.startPosition.row + 1 });
      if (typeSeen(node, scope.typeDecl) === 'assembly') out.push({ symbolKey: internalKey(symbolKey), line: node.startPosition.row + 1 });
      if (node.type === 'interface_declaration') out.push({ symbolKey: interfaceKey(symbolKey), line: node.startPosition.row + 1 });
    }
    // The base list (see `baseListKey`): `class C(int x) : Base(x)` writes the base's type first and its arguments after it.
    const list = BASE_LIST_OWNERS.has(node.type) ? node.namedChildren.find((c) => c!.type === 'base_list') : undefined;
    for (const entry of list?.namedChildren ?? []) {
      const typeNode = entry!.type === 'primary_constructor_base_type' ? entry!.namedChild(0) : entry;
      if (typeNode !== null && typeNode.type !== 'argument_list') record(fileLocal ? fileBaseListKey(symbolKey) : baseListKey(symbolKey), typeNode, scope, line, typeParameterNames(node));
    }
    return undefined;
  });
  for (const [typeKey, listed] of listedMembers) out.push({ symbolKey: `${membersKey(typeKey)}\t${[...listed.entries].join(' ')}`, line: listed.line });
  for (const [typeKey, listed] of methods) out.push({ symbolKey: `${methodsKey(typeKey)}\t${[...listed.entries].join(' ')}`, line: listed.line });
  if (written) out.push({ symbolKey: `${USINGS_KEY}\t${encodeUsings({ scope: buildUsingScope(file), fileLocalTypes })}`, line: 1 });

  // Top-level statements compile into a class named `Program` in the global namespace, which the source never declares; `WebApplicationFactory<Program>` names it. Publish it at the first statement under the fallback key (see IMPLICIT_PROGRAM_KEY), unless the file declares a global `Program` itself (`public partial class Program { }`), whose own key already covers it.
  const firstStatement = firstTopLevelStatement(file.tree.rootNode);
  if (firstStatement && !out.some((d) => d.symbolKey === 'Program')) {
    out.push({ symbolKey: IMPLICIT_PROGRAM_KEY, line: firstStatement.startPosition.row + 1 });
  }

  return out;
}

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
  aliasDecls: Map<string, Array<{ fqn: string; body: string[]; rooted: boolean; outer: OuterUsings[]; start: number; end: number }>>;
  /** Every plain `using N;` directive of the file that is not a `global using`, in file order: `ns` the namespace as written (its `global::` qualifier stripped, and then `rooted`: such a namespace is read from the global namespace only), `body` the enclosing-namespace chain of the body that holds it (innermost first, empty in the compilation unit), `start`/`end` the text range of that body's block (`directiveBlock`). The directive imports its namespace for the references inside that range only, at the level of `body[0]`; inside a namespace body the namespace it names is read where it stands, nearest namespace first (C# spec §14.5.3). `prefixes` lists the same directives' namespaces without their place. */
  prefixDecls: Array<{ ns: string; rooted: boolean; body: string[]; start: number; end: number }>;
  /** The written TARGET type (its `global::` qualifier stripped, with the directive's line) of each `using static N.C;` /
   *  `global using static N.C;` directive in this file (A8/A11). The directive names a concrete
   *  type whose static members are imported — that target is a real type dependency of this file,
   *  NOT a namespace prefix (a sibling `N.Baz` is never imported). The edge itself comes from the
   *  `target` descriptors the extract emits for the directive, which read the type where the directive stands. */
  staticTargets: Array<{ fqn: string; line: number }>;
  /** Every `using static T;` directive of the file, the global ones included, in file order: `fqn` the written type with its type arguments as arity (``Repo`1``) and its `global::` qualifier stripped (and then `rooted`: it is read from the global namespace only), `body` the enclosing-namespace chain of the body that holds it (innermost first, empty in the compilation unit and for a `global using static`), `start`/`end` the text range of that body's block (`directiveBlock`). The directive imports the nested types of `T` and its extension methods, for the references inside that range, at the level of `body[0]` (C# spec §14.5.4); in the compilation unit it is the last level of the lookup, with the plain usings. */
  staticDecls: Array<{ fqn: string; rooted: boolean; body: string[]; start: number; end: number }>;
  /** The types the `global using static T;` directives of THIS file name (as `staticDecls` writes them), tracked apart like `globalPrefixes` so the consumer's relation pass can aggregate them project-wide. */
  globalStatics: string[];
}

const NAMESPACE_NODE_TYPES = new Set([
  'qualified_name',
  'identifier',
  'generic_name',
  'alias_qualified_name',
]);

/** The imported namespace/type dotted text of a `using_directive`. When `skipName` is the
 *  directive's `name`-field node (the alias identifier in `using Alias = Foo.Bar;`), it is
 *  skipped so the ALIASED target is returned, not the alias name. The text is normalized so a
 *  `global::`-rooted import (`global::Foo.Bar`) records the clean dotted FQN. */
function directiveNamespaceText(directive: Node, skipName: Node | null = null): string | undefined {
  for (const c of directive.namedChildren) {
    if (c === null) continue;
    if (skipName !== null && c.id === skipName.id) continue;
    if (NAMESPACE_NODE_TYPES.has(c.type)) return stripGlobalQualifier(c.text);
  }
  return undefined;
}

/**
 * True when a `declaration_expression` sits where C# lets one declare a variable: as an `out` argument (`F(out T x)`), or as an element, at any tuple depth, of the target of a deconstruction (`(T a, U b) = …`, `foreach ((T a, U b) in …)`). The grammar also reads a comparison pair in an argument list, `F(i < A, j > B)` or `F(x.i < A, j > B)`, as a declaration of a variable `B` of the generic type `i<A, j>` or `x.i<A, j>`; that reading sits in a plain argument and is rejected here, and so is a declaration-shaped element of a tuple that is not a deconstruction target.
 */
function declaresVariable(decl: Node, scope: CsScope): boolean {
  const arg = decl.parent!; // a declaration expression is always an argument's child
  if (hasTokenChild(arg, 'out')) return true;
  // A tuple in an argument of a tuple continues the nest: the outermost tuple of the nest is carried down the walk (`scope.tuple`).
  const tuple = scope.tuple?.stage === 'arg' ? scope.tuple.root : arg.parent!;
  if (tuple.type !== 'tuple_expression') return false;
  const target = tuple.parent!;
  return (target.type === 'assignment_expression' || target.type === 'foreach_statement') && target.childForFieldName('left')?.id === tuple.id;
}

/** True when a using directive's namespace is written after `global::` (`using global::Core;`): it names that namespace from the global namespace. */
function isRootedDirective(directive: Node): boolean {
  return directive.namedChildren.some((c) => c !== null && NAMESPACE_NODE_TYPES.has(c.type) && c.text.startsWith('global::'));
}

/** True when the directive has an anonymous token child of the given keyword type. */
function hasTokenChild(directive: Node, token: string): boolean {
  for (const c of directive.children) {
    if (c !== null && !c.isNamed && c.type === token) return true;
  }
  return false;
}

/** The dotted text of a chain of plain identifiers (`Shop.Core.Customer`, a member access or a qualified name), or undefined for any other expression. */
function dottedName(node: Node): string | undefined {
  if (node.type === 'identifier') return node.text;
  if (node.type !== 'member_access_expression' && node.type !== 'qualified_name') return undefined;
  const head = dottedName(node.childForFieldName(node.type === 'qualified_name' ? 'qualifier' : 'expression')!);
  const tail = node.childForFieldName('name')!;
  return head !== undefined && tail.type === 'identifier' ? `${head}.${tail.text}` : undefined;
}

/** The leftmost identifier of a chain of member accesses (`App` of `App.Models.Order`), or the empty string when the chain starts with anything else, a `global::` name included, which no name this file declares can shadow. */
function leftmostName(node: Node): string {
  let cur = node;
  while (cur.type === 'member_access_expression') cur = cur.childForFieldName('expression')!;
  return cur.type === 'identifier' ? cur.text : '';
}

/** Strip a leading `global::` alias qualifier (R12): `global::A.B.Base` → `A.B.Base`, resolved
 *  as a fully-qualified name from the root. A NON-`global` extern/using alias qualifier
 *  (`Lib::A.B`) is left intact — its `::` text never matches a dot-only declaration key, so it
 *  stays silence-by-luck (R13), never mis-binding a same-tail type. */
function stripGlobalQualifier(text: string): string {
  return text.startsWith('global::') ? text.slice('global::'.length) : text;
}

/** `A.B<C<D>>.E` → `A.B.E`: drop every (nested) type-argument list from a written type name. */
function stripTypeArguments(text: string): string {
  let depth = 0;
  let out = '';
  for (const ch of text) {
    if (ch === '<') depth++;
    else if (ch === '>') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

/**
 * The generic arity of a type argument or type parameter list written as `text` (`<int, Dictionary<K, V>>` → 2, `<(int, int)>` → 1, the unbound `<,>` → 2 and `<>` → 1): the commas at the list's own level, plus one. C# looks a name with K type arguments up among the types with K type parameters only (spec §7.6.1), so the arity is part of every C# type key, as the .NET reflection name writes it: `Result` for a non-generic type, ``Result`1`` for `Result<T>`.
 */
function arityOf(list: string): number {
  let depth = 0;
  let commas = 0;
  for (const ch of list) {
    if (ch === '<' || ch === '(' || ch === '[') depth++;
    else if (ch === '>' || ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 1) commas++;
  }
  return commas + 1;
}

/** `A.B<C<D>, E>.F` → ``A.B`2.F``: every type-argument list of a written type name becomes its arity (see `arityOf`), so the name reads as a key. */
function withArity(text: string): string {
  let depth = 0;
  let list = '';
  let out = '';
  for (const ch of text) {
    if (ch === '<') depth++;
    if (depth > 0) list += ch;
    else out += ch;
    if (ch === '>' && depth > 0 && --depth === 0) {
      out += `\`${arityOf(list)}`;
      list = '';
    }
  }
  return out;
}

/** The key segment of a `generic_name` (`Result<int>` → ``Result`1``): its identifier and the arity of its type-argument list. */
function genericKey(generic: Node): string {
  const id = generic.namedChildren.find((c) => c !== null && c.type === 'identifier')!.text;
  const args = generic.namedChildren.find((c) => c !== null && c.type === 'type_argument_list')!;
  return `${id}\`${arityOf(args.text)}`;
}

/** The key segment a type declaration declares: its name, and its arity when it declares type parameters (`class Result<T>` → ``Result`1``). */
function declaredTypeName(decl: Node): string {
  const name = decl.childForFieldName('name')?.text ?? '';
  const list = decl.namedChildren.find((c) => c !== null && c.type === 'type_parameter_list');
  const arity = list === undefined || list === null ? 0 : list.namedChildren.filter((c) => c !== null && c.type === 'type_parameter').length;
  return name === '' || arity === 0 ? name : `${name}\`${arity}`;
}

/** Build the file's using scope: file-local plain prefixes, project-wide `global using`
 *  prefixes, the alias map (file-local + project-wide global aliases tracked apart), and the
 *  fully-resolved target type of each `using static` / `global using static` directive. */
function buildUsingScope(file: ParsedFile): UsingScope {
  const prefixes: string[] = [];
  const globalPrefixes: string[] = [];
  const aliases = new Map<string, string>();
  const globalAliases = new Map<string, string>();
  const aliasDecls = new Map<string, Array<{ fqn: string; body: string[]; rooted: boolean; outer: OuterUsings[]; start: number; end: number }>>();
  const prefixDecls: UsingScope['prefixDecls'] = [];
  const staticTargets: Array<{ fqn: string; line: number }> = [];
  const staticDecls: UsingScope['staticDecls'] = [];
  const globalStatics: string[] = [];

  const info = fileNsInfo(file.tree.rootNode);
  walkCs(file.tree.rootNode, (node, scope) => {
    // A using directive stands in the compilation unit or in a namespace body, never inside a type or a statement: those are not entered.
    if (TYPE_KEY_DECLARATION_TYPES.has(node.type) || node.type === 'global_statement') return false;
    if (node.type !== 'using_directive') return undefined;

    // `using static N.C;` imports a type's static MEMBERS, not a namespace → NO namespace
    // prefix. But the TARGET type `N.C` IS a real type dependency of this file (A8/A11),
    // resolved like an alias RHS (already fully-qualified). Record it as a static target.
    if (hasTokenChild(node, 'static')) {
      const target = directiveNamespaceText(node);
      if (target !== undefined && target !== '') {
        staticTargets.push({ fqn: target, line: node.startPosition.row + 1 });
        const block = directiveBlock(file, node, scope, info);
        const fqn = withArity(target);
        staticDecls.push({ fqn, rooted: isRootedDirective(node), body: directiveBodyChain(info, node, scope), start: block.start, end: block.end });
        if (hasTokenChild(node, 'global')) globalStatics.push(fqn);
      }
      return undefined;
    }

    // `using Alias = Foo.Bar;` — the `name` field is the alias; record alias→FQN. Do
    // NOT treat the alias as a namespace prefix. A `global using Alias = ...` is ALSO
    // recorded apart so the consumer's relation pass can apply the alias project-wide (A12).
    const aliasName = node.childForFieldName('name');
    if (aliasName !== null) {
      const written = directiveNamespaceText(node, aliasName);
      // A closed-generic alias target (`using R = Shop.Core.Repository<Order>;`) binds by its
      // plain container name — declaration keys carry no arity (the embedded type arguments are
      // harvested separately as their own references).
      const fqn = written === undefined ? undefined : withArity(written);
      if (fqn !== undefined && fqn !== '') {
        aliases.set(aliasName.text, fqn);
        const targetNode = node.namedChildren.find((c) => c !== null && c.id !== aliasName.id);
        const decls = aliasDecls.get(aliasName.text) ?? [];
        const block = directiveBlock(file, node, scope, info);
        decls.push({ fqn, body: directiveBodyChain(info, node, scope), rooted: targetNode?.text.startsWith('global::') === true, outer: outerUsings(info, scope), start: block.start, end: block.end });
        aliasDecls.set(aliasName.text, decls);
        if (hasTokenChild(node, 'global')) globalAliases.set(aliasName.text, fqn);
      }
      return undefined;
    }

    // Plain `using Foo.Bar;` or `global using Foo.Bar;` — a namespace import. Either binds
    // for THIS file; a `global using` is ALSO recorded apart so the consumer's relation pass can apply it
    // project-wide to every C# file.
    const ns = directiveNamespaceText(node);
    if (ns !== undefined && ns !== '') {
      if (hasTokenChild(node, 'global')) globalPrefixes.push(ns);
      else {
        prefixes.push(ns);
        const block = directiveBlock(file, node, scope, info);
        prefixDecls.push({ ns, rooted: isRootedDirective(node), body: directiveBodyChain(info, node, scope), start: block.start, end: block.end });
      }
    }
    return undefined;
  });

  return { prefixes, globalPrefixes, aliases, globalAliases, aliasDecls, prefixDecls, staticTargets, staticDecls, globalStatics };
}

/** The enclosing-namespace chain of a using directive, innermost first: the namespace body that holds it. A directive above a file-scoped `namespace X;` sits in the compilation unit (empty chain), one below it in the namespace body. */
/** The text range of the block that holds a using directive: the namespace declaration around it, or from a file-scoped `namespace X;` to the end of the file when the directive sits below one, or the whole file when it sits in the compilation unit. An alias reaches the uses inside that range and no other. */
function directiveBlock(file: ParsedFile, directive: Node, scope: CsScope, info: FileNsInfo): { start: number; end: number } {
  if (scope.ns !== null) return { start: scope.ns.decl.startIndex, end: scope.ns.decl.endIndex };
  const root = file.tree.rootNode;
  if (info.scopedStart !== undefined && directive.startIndex > info.scopedStart) return { start: info.scopedStart, end: root.endIndex };
  return { start: 0, end: root.endIndex };
}

/** The using directives of one namespace declaration that encloses, from outside, the body holding a using directive: `ns` is that declaration's namespace, `prefixes` the namespaces its plain usings name (as written, a `global::` qualifier kept: each is read where the declaration stands, a rooted one from the global namespace), `aliases` the names its using aliases declare, `statics` the types its `using static` directives name (as written, type arguments as their arity, a `global::` qualifier kept like a plain using's), whose nested types and extension methods they import (C# spec §14.5.4). */
interface OuterUsings { ns: string; prefixes: string[]; aliases: string[]; statics: string[] }

/** What a `using static T;` directive adds to a set of readings: `key` gives the reading of a type `T` read where its directive stands (`T.<name>` for a nested type, `T.<name>()` for an extension method), `nestedOnly` whether the reading binds a nested type only. */
interface StaticImport { key: (typeKey: string) => string; nestedOnly: boolean }

/** A symbol hint, the only kind the C# extractor emits. */
type SymbolHint = Extract<TargetHint, { kind: 'symbol' }>;

/** A using alias as one use sees it: its `target`, read where its directive reads it (`chain`, the namespaces of the directive's body innermost first, and `outer`, the using directives around that body); `bodyNs` the namespace of the body that holds the directive (undefined for the compilation unit); `at` a position inside the block of the directive, which tells the alias declarations of the declarations around it apart. */
interface AliasView { target: string; chain: string[]; outer: OuterUsings[]; bodyNs: string | undefined; at: number }

/** The using directives of every namespace declaration around the body that holds `directive`, innermost first, the declarations without any left out: in C# they take part in the lookup of the directive's target at their own namespace (spec §7.8.1), while those of the body that holds the directive do not (§14.5.2). The compilation unit's own usings are not listed (a deliberate silence: C# reads them only after the global namespace). */
function outerUsings(info: FileNsInfo, scope: CsScope): OuterUsings[] {
  if (scope.ns === null) return [];
  return outerList(scope.ns, info).map((o) => ({ ns: o.ns, prefixes: [...o.prefixes], aliases: [...o.aliases], statics: [...o.statics] }));
}

/** The using directives of the namespace declaration `frame`, as the lookup from a directive in a body inside it reads them; null when it has none (or its namespace has no name to spell). Read once per declaration. */
function nsEntry(frame: NsFrame, info: FileNsInfo): OuterUsings | null {
  if (frame.entry !== undefined) return frame.entry;
  const body = frame.decl.childForFieldName('body')!;
  const prefixes: string[] = [];
  const aliases: string[] = [];
  const statics: string[] = [];
  for (const d of body.namedChildren) {
    if (d!.type !== 'using_directive') continue;
    if (hasTokenChild(d!, 'static')) {
      const target = directiveNamespaceText(d!);
      if (target !== undefined && target !== '') statics.push(isRootedDirective(d!) ? `global::${withArity(target)}` : withArity(target));
      continue;
    }
    const aliasName = d!.childForFieldName('name');
    if (aliasName !== null) aliases.push(aliasName.text);
    else {
      const ns = directiveNamespaceText(d!);
      if (ns !== undefined && ns !== '') prefixes.push(isRootedDirective(d!) ? `global::${ns}` : ns);
    }
  }
  let entry: OuterUsings | null = null;
  if (prefixes.length > 0 || aliases.length > 0 || statics.length > 0) {
    // The namespace the declaration stands for, spelled as the levels of the lookup are (`directiveBodyChain`): the chain of a node directly in its body, innermost first.
    const below = info.scopedStart !== undefined && body.startIndex > info.scopedStart;
    const ns = namespaceChain(below ? info.fileNs : '', frame)[0];
    if (ns !== undefined) entry = { ns, prefixes, aliases, statics };
  }
  frame.entry = entry;
  return entry;
}

/** The using directives of the namespace declarations around the body of `frame`, innermost first, those without any left out; memoised on each declaration so that a deep nest of namespaces reads each once. */
function outerList(frame: NsFrame, info: FileNsInfo): OuterUsings[] {
  const pending: NsFrame[] = [];
  for (let f: NsFrame | null = frame; f !== null && f.outerList === undefined; f = f.outer) pending.push(f);
  while (pending.length > 0) {
    const f = pending.pop()!;
    const outside = f.outer === null ? undefined : nsEntry(f.outer, info);
    const rest = f.outer === null ? [] : f.outer.outerList!;
    f.outerList = outside === null || outside === undefined ? rest : [outside, ...rest];
  }
  return frame.outerList!;
}

function directiveBodyChain(info: FileNsInfo, directive: Node, scope: CsScope): string[] {
  const below = info.scopedStart !== undefined && directive.startIndex > info.scopedStart;
  return namespaceChain(below ? info.fileNs : '', scope.ns);
}

/**
 * Collect the `global using Foo.Bar;` namespace prefixes a C# file declares (project-wide
 * imports). Used by the cross-file pre-pass in the consumer's relation pass to aggregate the global usings of every
 * file of a project before per-file resolution, so a `global using` in ANY file of the project
 * qualifies bare names in EVERY file of that project (R5, M6). Aliases and `using static` are file-local (per the C# spec, a `global using static`
 * / `global using alias` is still project-wide, but its members/alias are not a namespace
 * prefix), so only the namespace-import global prefixes are aggregated here.
 */
export function collectGlobalUsings(file: ParsedFile): string[] {
  return buildUsingScope(file).globalPrefixes;
}

/**
 * Collect the types the `global using static N.C;` directives of a C# file name (project-wide imports of the nested types and the extension methods of `N.C`), as the cross-file pre-pass of the consumer's relation pass aggregates them per project beside the global namespace imports. A type's type arguments are written as their arity (``Repo`1``), as in a type key.
 */
export function collectGlobalUsingStatics(file: ParsedFile): string[] {
  return buildUsingScope(file).globalStatics;
}

/**
 * Collect the `global using Alias = Foo.Bar;` aliases a C# file declares (project-wide
 * aliases, A12). Used by the cross-file pre-pass in the consumer's relation pass to aggregate every file's global
 * aliases before per-file resolution, so a `global using` alias declared in ANY file is usable
 * in EVERY file. The alias RHS is resolved fully-qualified vs the global namespace (C# resolves
 * an alias RHS ignoring other usings and the enclosing namespace), so the captured dotted FQN
 * IS the resolved target in the declaring file's context — aggregating `[alias, fqn]` pairs is
 * sufficient. Returned as entries so the consumer's relation pass can union them into a project-wide alias map.
 */
export function collectGlobalUsingAliases(file: ParsedFile): Array<[string, string]> {
  return [...buildUsingScope(file).globalAliases.entries()];
}

/** The enclosing-namespace prefixes for a reference, INNERMOST first. For a reference in
 *  `namespace App.Services.Sub` (file-scoped `App` + block chain `Services.Sub`) the chain
 *  is `["App.Services.Sub", "App.Services", "App"]` — C# looks an unqualified/partial name
 *  up against each progressively-shorter enclosing namespace, innermost outward, before the
 *  imports. An empty result means the reference sits at true file scope. */
function namespaceChain(fileNs: string, ns: NsFrame | null): string[] {
  const build = (): string[] => {
    const segments = [fileNs, ns?.joined ?? '']
      .filter((p) => p !== '')
      .join('.')
      .split('.')
      .filter((s) => s !== '');
    const chain: string[] = [];
    for (let i = segments.length; i >= 1; i--) chain.push(segments.slice(0, i).join('.'));
    return chain;
  };
  if (ns === null) return build();
  // Read once per namespace: a node's chain is its namespace's, however many nodes sit in it (a copy, so no two descriptors share an array).
  if (fileNs === '') return (ns.chainPlain ??= build()).slice();
  return (ns.chainWithFile ??= build()).slice();
}

/** What the file's compilation unit says about its namespaces: the file-scoped namespace FQN (`namespace Foo.Bar;`, '' if none) and where it starts (undefined if none), which tells a directive or a node that sits below it from one above it. */
interface FileNsInfo { fileNs: string; scopedStart: number | undefined }

function fileNsInfo(root: Node): FileNsInfo {
  const scoped = root.namedChildren.find((c) => c !== null && c.type === 'file_scoped_namespace_declaration');
  return { fileNs: fileScopedNamespace(root), scopedStart: scoped?.startIndex };
}

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
  | { kind: 'plain'; ref: string; line: number; rooted: boolean; enclosingNs: string[]; at: number; types?: string[] }
  /** An `S::Tail` alias-qualified reference (`alias_qualified_name`, non-`global` alias). Emitted
   *  only on assembly IF the merged alias map binds `aliasName` → its rewritten `${fqn}.${tail}`
   *  resolves verbatim-from-root; otherwise dropped (extern/unknown alias → R13 silence). */
  | { kind: 'alias'; aliasName: string; tail: string; line: number; enclosingNs: string[]; at: number }
  /** A named type written in the TARGET of a using alias directive (`using F = A.B.Foo;`, a dependency on that type whether or not the alias is used) or of a `using static` directive (`using static N.C;`, the type whose static members are imported), the container and each type argument of a generic one among them. C# resolves the target in the namespace body that holds the directive, nearest namespace first and the global namespace last, and no using directive or alias of that body takes part (usings of an outer compilation unit would, in C#; reading none of them is a deliberate conservatism) (C# spec §14.5.2), so the group is the enclosing-namespace readings, innermost first, then the name verbatim. The using directives of an enclosing namespace declaration (`outer`, absent when there are none) do take part, at their own namespace: after its reading, an alias they declare of the target's first name decides there and is read where its own directive reads its target; else the types of the namespaces they import (each namespace read where that declaration stands) and the nested types of the types their `using static` directives name, as one CS0104 set. Each reading farther than the first carries the nearer namespaces or types of the target's first name that C# would stop at (`shadow`). `at` is where the directive stands, which tells the outer alias declaration apart. `enclosingNs` is empty for a directive outside any namespace body (a global using, or one above a file-scoped namespace). An alias target may name a namespace as much as a type; a nearer namespace of its first name voids every farther reading through `shadow` (C# spec §7.8.1). */
  | { kind: 'target'; fqn: string; line: number; enclosingNs: string[]; at: number; outer?: OuterUsings[] }
  /** An attribute usage `[Foo]` / `[FooAttribute]` — TWO readings (`written` + the optional `Attribute`-suffixed form) merged into ONE ordered group on assembly (E9). `rooted` (a `global::`-qualified name, `[global::A.Foo]`) resolves both readings verbatim-only. `alias` (an attribute written after a using alias, `[S::Foo]`) rewrites both readings onto the namespace the merged alias map binds `S` to, each then resolved verbatim from the root as a type's `S::Tail` is; an alias the map does not bind (an extern or unknown alias) drops the attribute. */
  | { kind: 'attr'; written: string; suffixed?: string; line: number; enclosingNs: string[]; at: number; rooted?: boolean; alias?: string; types?: string[] }
  /** The receiver of a member access through a TYPE name (`Guard.NotNull(x)`, `OrderStatus.Paid`, `Shop.Core.Guard.NotNull(x)`): `chain` is the dotted receiver, leftmost first, without the accessed member. On assembly each prefix (`Shop`, `Shop.Core`, `Shop.Core.Guard`) is one reading, and the readings of all of them make ONE group in the order of the lookup: at each step (an enclosing type, an enclosing namespace, what its usings import, and so on outward) every prefix, shortest first, before any reading of a step farther out. C# binds the leftmost simple name at the nearest step that knows it and reads further segments only when it names a namespace. Emitted only when the leftmost identifier is not a name this file declares (a local, parameter, field, property, method…), so a value that shadows a type name never manufactures a type edge. `rooted` (a receiver written after `global::`, `global::X.Run()`) reads every prefix verbatim-only, and no declared name shadows it. `members` names, by its place in the extract's `lists`, the keys of the types around the receiver, innermost first, that can hold a member this file does not show (a `partial` type, or one that lists a base): where the first name is such a member there, the receiver is a value and names no type. Absent when no type around it can. */
  | { kind: 'receiver'; chain: string[]; line: number; enclosingNs: string[]; at: number; rooted?: boolean; types?: string[]; members?: number }
  /** An extension-method call `value.Name(…)` on an instance-like receiver: resolved against the
   *  extension-method keys (`<ns>.Name()`) of the enclosing namespaces, each followed by the namespaces
   *  its using directives import where the call stands (`at`), then the global namespace, then the
   *  namespaces the compilation unit's using directives import as one set.
   *  `args` and `typeArgs` count the call's arguments and its written type arguments: an instance method takes the call only when the counts fit it. They, and `from`, are written only on a call that carries a receiver type to ask (`on`, `self`, or a `member` that is the receiver alone): nothing reads them on any other.
   *  `member` is set where the receiver's first name is one the file does not declare, written inside a type: the call is an extension call only when that name is a member of one of `member.types` (named by its place in the extract's `lists`: the types around the call, innermost first, that can hold a member this file does not show: a `partial` type, or one that lists a base), declared in another part or inherited, and a static call through a type otherwise, so the group is given only where such a type stands around the call; `direct` says the receiver is that name alone, so the member's own type is the receiver's.
   *  `from` names, by its place in the extract's `lists`, the keys of the types whose bodies hold the call, innermost first: a protected or a private method takes the call only from where it can be called.
   *  `on` names, by their places in the extract's `receiverTypes`, the written type of the receiver where the file declares it (a parameter, a field, a property or a local with a type of its own; several when declarations of the name in one scope differ), and `self` the key of the enclosing type for a call on `this`: an instance method of that name in such a type, or in a base of it, is what the call binds (C# spec §12.8.10.3), and the group then gives nothing. Both are absent where the receiver's type is not written (`var`, a call result, an inferred lambda parameter). */
  | { kind: 'ext'; name: string; line: number; enclosingNs: string[]; at: number; args?: number; typeArgs?: number; on?: number[]; self?: string; from?: number; member?: { types: number; name: string; direct: boolean } };

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
  /** The lists of type keys the descriptors name by their place here (an `ext` descriptor's `from` and `member.types`, a `receiver` descriptor's `members`): a list many calls of one type body share is written once. Absent only when no descriptor names one: whoever stores `refs` stores this with them, and a descriptor that names a place this does not hold gives no candidate group. */
  lists?: string[][];
  /** The written types of the receivers of the file's extension-shaped calls, each as the reference that type is, which an `ext` descriptor's `on` names by their place here: every call on one parameter, field or local shares one. Absent only when no call has one, and stored with `refs` like `lists`. */
  receiverTypes?: CsharpRefDescriptor[];
}

/** Receiver node types that name a TYPE, never an instance (`base.X()`, `string.Join()`,
 *  `List<int>.X`, `A.B.X()` as a qualified name) — an extension method is never called on them. */
const NON_INSTANCE_RECEIVERS = new Set(['base', 'predefined_type', 'generic_name', 'qualified_name', 'alias_qualified_name']);

/** `System.Object` member names. Every receiver has these as instance methods, and an instance
 *  method always wins over a same-named extension method, so a call to one of them is never an
 *  extension-method call even when an in-repo extension of that name is in scope. */
const OBJECT_MEMBER_NAMES = new Set(['ToString', 'Equals', 'GetHashCode', 'GetType', 'MemberwiseClone', 'ReferenceEquals']);

/** Declaring node types whose `name` field introduces a value or member name. */
const NAME_DECLARING_TYPES = new Set([
  'variable_declarator',
  'parameter',
  'method_declaration',
  'local_function_statement',
  'property_declaration',
  'event_declaration',
  'enum_member_declaration',
  'delegate_declaration',
  'declaration_pattern',
  'declaration_expression',
  'catch_declaration',
  'from_clause',
  'let_clause',
  'join_clause',
  'join_into_clause',
  'tuple_pattern',
  'receiver_parameter',
  ...TYPE_DECLARATION_TYPES,
]);

/** Where the file declares each value name, with the type it writes: `type` is null where the declaration writes none of its own (`var`, an inferred lambda parameter, a pattern or `out` designation, a range variable), `start` and `end` the text range the name is in scope in, as near as the tree says without climbing from every use (the block, the statement that declares in its own header (`for`, `using`, `fixed`, a `catch` clause, a `switch` section or arm) or the callable around a local or a parameter, the type declaration around a field or a property), and `member` whether it is a member of that type. */
type TypedNames = Map<string, Array<{ type: Node | null; start: number; end: number; member: boolean }>>;

/** The nodes a declared name is scoped to. */
const SCOPE_NODES = new Set(['block', 'for_statement', 'using_statement', 'fixed_statement', 'switch_section', 'catch_clause', 'switch_expression_arm', 'method_declaration', 'constructor_declaration', 'destructor_declaration', 'accessor_declaration', 'local_function_statement', 'lambda_expression', 'anonymous_method_expression', 'operator_declaration', 'conversion_operator_declaration', 'indexer_declaration', 'property_declaration', 'arrow_expression_clause', 'compilation_unit', ...TYPE_DECLARATION_TYPES]);

/**
 * Every name this file DECLARES that is not a namespace: locals, parameters (method, lambda,
 * primary-constructor), fields, properties, events, methods and local functions, enum members,
 * pattern/`out var`/deconstruction designations, `foreach`/`catch`/query range variables, and the
 * file's own type names — collected file-wide, not per scope. A type parameter is not a value: it
 * is scoped to its own declaration by `isTypeParameterInScope`, never file-wide.
 *
 * WHY FILE-WIDE (the M16 shadow guard): a member access `X.Member` reads as a static access
 * through the TYPE `X` only when no nearer value named `X` is in scope. Deciding real C# scoping
 * would need the enclosing method, lambda and type bodies; over-approximating to the whole file
 * can only drop a reading (a missed edge), never add one, which is the direction the zero-false-
 * positive contract allows. Also returns the ordinary (non-extension) method names the file
 * declares: a call `x.Name()` whose name the file itself declares as a method is most likely that
 * instance method, which C# prefers over any extension method.
 */
function collectDeclaredNames(root: Node, fileNs: string): { declaredNames: Set<string>; methodNames: Set<string>; openTypes: Set<string>; typedNames: TypedNames } {
  const declaredNames = new Set<string>();
  const methodNames = new Set<string>();
  // The keys of the types of the file that can hold a member the file does not show (`takesMembers`).
  const openTypes = new Set<string>();
  const typedNames: TypedNames = new Map();
  const typed = (name: string, type: Node | null, within: Node, member = false): void => {
    const entry = { type: type !== null && type.type === 'implicit_type' ? null : type, start: within.startIndex, end: within.endIndex, member };
    const list = typedNames.get(name);
    if (list === undefined) typedNames.set(name, [entry]);
    else list.push(entry);
  };
  // One walk carries the scope of every node (`CsScope`) with the nearest scope node and the nearest type declaration around it.
  interface Around { cs: CsScope; scope: Node; type: Node | null; listOf: Node | null }
  walkScoped<Around>(root, { cs: TOP_SCOPE, scope: root, type: null, listOf: null }, (node, inherited, parentOf) => {
    // The node's type is read once: the visitor asks it many times, for every node of the file.
    const type = node.type;
    const scope = csSeen(node, inherited.cs);
    const { scope: around, type: holderType } = inherited;
    if (TYPE_DECLARATION_TYPES.has(type) && takesMembers(node)) {
      const key = declaredTypeKey(node, scope, fileNs);
      if (key !== undefined) openTypes.add(key);
    }
    if (type === 'implicit_parameter' || type === 'single_variable_designation') {
      declaredNames.add(node.text);
      typed(node.text, null, around);
    } else if (type === 'foreach_statement') {
      const left = node.childForFieldName('left')!;
      if (left.type === 'identifier') {
        declaredNames.add(left.text); // `foreach (var (a, b) in …)` is a pattern
        typed(left.text, node.childForFieldName('type'), node);
      }
    } else if (NAME_DECLARING_TYPES.has(type)) {
      // An ordinary (non-extension) method or local function also names a callable member.
      const ordinaryMethod =
        (type === 'method_declaration' || type === 'local_function_statement') && extensionMethodName(node, scope) === undefined;
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c === null || c.type !== 'identifier' || node.fieldNameForChild(i) !== 'name') continue;
        const name = c.text;
        declaredNames.add(name);
        if (ordinaryMethod) methodNames.add(name);
        if (type === 'parameter') {
          // A parameter is in scope in the declaration its list belongs to; a primary constructor's in the whole type.
          typed(name, node.childForFieldName('type'), inherited.listOf ?? around);
        } else if (type === 'property_declaration') {
          if (holderType !== null) typed(name, node.childForFieldName('type'), holderType, true);
        } else if (type === 'catch_declaration' || type === 'from_clause' || type === 'let_clause' || type === 'join_clause' || type === 'join_into_clause') {
          typed(name, null, around);
        }
      }
    }
    if (type === 'variable_declaration') {
      const holder = parentOf()!;
      const member = (holder.type === 'field_declaration' || holder.type === 'event_field_declaration') && holderType !== null;
      for (const d of node.namedChildren) {
        const name = d!.type === 'variable_declarator' ? d!.childForFieldName('name') : null;
        if (name !== null && name.type === 'identifier') typed(name.text, node.childForFieldName('type'), member ? holderType! : around, member);
      }
    }
    const below = csBelow(node, scope, parentOf) ?? scope;
    const opens = SCOPE_NODES.has(type);
    // The parameters of a list are in scope in the declaration the list belongs to.
    const lists = type === 'parameter_list' || type === 'bracketed_parameter_list';
    if (below === inherited.cs && !opens && !lists && inherited.listOf === null) return undefined;
    return { cs: below, scope: opens ? node : around, type: TYPE_DECLARATION_TYPES.has(type) ? node : holderType, listOf: lists ? parentOf() : null };
  });
  return { declaredNames, methodNames, openTypes, typedNames };
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
export function extractCsharpRefs(file: ParsedFile): CsharpExtract {
  const scope = buildUsingScope(file);
  const info = fileNsInfo(file.tree.rootNode);
  const fileNs = info.fileNs;
  // The scope of every node (the namespaces and types around it, the type parameters in scope...), read once down the tree instead of by climbing from each node.
  const scopes = csIndex(file.tree.rootNode);
  const scopeOf = (node: Node): CsScope => scopes.get(node.id)!;
  const nsChain = (node: Node): string[] => namespaceChain(fileNs, scopeOf(node).ns);
  const refs: CsharpRefDescriptor[] = [];

  /** The declaration keys of the types around `node`, innermost first (`['App.Outer+Inner', 'App.Outer']`), or undefined outside every type: C# reads the nested types of each enclosing type, from every part of a partial type, before any namespace, alias or using (spec §7.6.1, §12.8.4). Read once per type and namespace. */
  const typesMemo = new Map<string, string[]>();
  const enclosingTypes = (node: Node): { types?: string[] } => {
    const chain = scopeOf(node).bodyChain;
    if (chain === '') return {};
    const ns = nsChain(node)[0];
    const memoKey = `${ns ?? ''}\0${chain}`;
    let types = typesMemo.get(memoKey);
    if (types === undefined) {
      const parts = chain.split('+');
      types = [];
      for (let i = parts.length; i >= 1; i--) {
        const type = parts.slice(0, i).join('+');
        types.push(ns === undefined ? type : `${ns}.${type}`);
      }
      typesMemo.set(memoKey, types);
    }
    return { types: types.slice() };
  };

  // A node id is recorded here once its TYPE reference has been emitted, so a later, broader
  // walk visit (e.g. the generic outermost-qualified_name pass) never re-emits the same node.
  const emittedIds = new Set<number>();
  // While `capturing`, a type node is read without being recorded: the reference it gives is taken aside (`describeType`) and the walk still emits the node in its own place.
  let capturing = false;
  const emitted = { has: (id: number): boolean => !capturing && emittedIds.has(id), add: (id: number): void => void (capturing || emittedIds.add(id)) };

  // Every value/member name this file declares (M16 shadow guard) and the names of the ordinary
  // (non-extension) methods it declares (m27 guard). See `collectDeclaredNames`.
  const { declaredNames, methodNames, openTypes, typedNames } = collectDeclaredNames(file.tree.rootNode, fileNs);

  // The lists and the receiver types the descriptors name by place (see `CsharpExtract.lists` and `receiverTypes`).
  const lists: string[][] = [];
  const listPlaces = new Map<string, number>();
  const listPlace = (list: string[]): number => {
    const key = list.join('\n');
    let place = listPlaces.get(key);
    if (place === undefined) listPlaces.set(key, (place = lists.push(list) - 1));
    return place;
  };
  const receiverTypes: CsharpRefDescriptor[] = [];
  const receiverTypePlaces = new Map<number, number>();

  /** The types around `node` in which its first name may be a member this file does not show (see the `receiver` descriptor's `members`). */
  const membersAround = (node: Node): { members?: number } => {
    const members = (enclosingTypes(node).types ?? []).filter((t) => openTypes.has(t));
    return members.length === 0 ? {} : { members: listPlace(members) };
  };

  /** True when `node` sits inside a `nameof(…)` operand — a string producer, never a dependency. */
  const insideNameof = (node: Node): boolean => scopeOf(node).nameof;

  /** True when a call's receiver is a VALUE rather than a type name: its leftmost element is a
   *  name this file declares, `this`, or any non-name expression (a call result, `new`, a literal,
   *  an index…). An undeclared leftmost identifier reads as a type (a static call, handled as a
   *  `receiver`); `base.X()` and a predefined/generic/qualified type receiver are never instances. */
  const instanceLikeReceiver = (receiver: Node): boolean => {
    let cur = receiver;
    while (cur.type === 'member_access_expression') cur = cur.childForFieldName('expression')!;
    if (cur.type === 'identifier') return declaredNames.has(cur.text);
    return !NON_INSTANCE_RECEIVERS.has(cur.type);
  };

  /** The method name of an extension-method-shaped call `value.Name(…)` / `value?.Name(…)`, or
   *  undefined when the call cannot be an in-repo extension-method call worth resolving. */
  /** The reference the written type `typeNode` is, taken aside from the walk, or undefined when it names no type of its own (a predefined type, an array, a tuple, a type parameter). A nullable `T?` is its `T`. */
  const describeType = (typeNode: Node): CsharpRefDescriptor | undefined => {
    const named = typeNode.type === 'nullable_type' ? typeNode.childForFieldName('type')! : typeNode;
    if (!NAMESPACE_NODE_TYPES.has(named.type)) return undefined;
    const before = refs.length;
    capturing = true;
    emitTypeNode(named);
    capturing = false;
    const described = refs[before];
    refs.length = before;
    return described;
  };

  /** What an `ext` descriptor says of its receiver: the receiver's written type, and the call's counts and the types around it where a receiver type will be asked. */
  const extensionReceiver = (inv: Node, call: { receiver: Node; args: number; typeArgs: number; member?: { direct: boolean } }): { args?: number; typeArgs?: number; from?: number; on?: number[]; self?: string } => {
    const receiver = receiverType(call.receiver);
    if (receiver.on === undefined && receiver.self === undefined && call.member?.direct !== true) return {};
    const from = enclosingTypes(inv).types;
    return { args: call.args, typeArgs: call.typeArgs, ...(from === undefined ? {} : { from: listPlace(from) }), ...receiver };
  };

  /** What the file says of the type of a call's receiver (see the `ext` descriptor): the enclosing type for `this`, the written types of the nearest declarations of a name for an identifier or `this.name`, or nothing where no type is written. */
  const receiverType = (receiver: Node): { on?: number[]; self?: string } => {
    if (receiver.type === 'this') {
      const self = enclosingTypes(receiver).types?.[0];
      return self === undefined ? {} : { self };
    }
    const viaThis = receiver.type === 'member_access_expression' && receiver.childForFieldName('expression')!.type === 'this';
    const nameNode = viaThis ? receiver.childForFieldName('name')! : receiver;
    if (nameNode.type !== 'identifier') return {};
    const at = receiver.startIndex;
    const inScope = (typedNames.get(nameNode.text) ?? []).filter((e) => at >= e.start && at < e.end && (!viaThis || e.member));
    if (inScope.length === 0) return {};
    // The nearest scope that declares the name decides; where it declares the name more than once, every written type counts, and one without a written type leaves the receiver unknown.
    const size = Math.min(...inScope.map((e) => e.end - e.start));
    const nearest = inScope.filter((e) => e.end - e.start === size);
    const on: number[] = [];
    for (const e of nearest) {
      if (e.type === null) return {};
      let place = receiverTypePlaces.get(e.type.id);
      if (place === undefined) {
        const described = describeType(e.type);
        place = described === undefined ? -1 : receiverTypes.push(described) - 1;
        receiverTypePlaces.set(e.type.id, place);
      }
      if (place === -1) return {};
      on.push(place);
    }
    return { on };
  };

  const extensionCall = (inv: Node): { name: string; receiver: Node; args: number; typeArgs: number; member?: { types: number; name: string; direct: boolean } } | undefined => {
    const fn = inv.childForFieldName('function')!;
    let nameNode: Node;
    let receiver: Node;
    if (fn.type === 'member_access_expression') {
      nameNode = fn.childForFieldName('name')!;
      receiver = fn.childForFieldName('expression')!;
    } else if (fn.type === 'conditional_access_expression') {
      // `value?.Name(…)`; a binding holding an ERROR is a parser recovery, never read as a call.
      const binding = findChild(fn, 'member_binding_expression');
      if (binding === null || findChild(binding, 'ERROR') !== null) return undefined;
      nameNode = binding.childForFieldName('name')!;
      receiver = fn.childForFieldName('condition')!;
    } else {
      return undefined;
    }
    // `value.Name<T>(…)` names the method by the generic's base identifier.
    const name = (nameNode.type === 'generic_name' ? findChild(nameNode, 'identifier')! : nameNode).text;
    if (OBJECT_MEMBER_NAMES.has(name) || methodNames.has(name)) return undefined;
    const args = inv.childForFieldName('arguments')!.namedChildren.filter((a) => a!.type === 'argument').length;
    const typeArgs = nameNode.type === 'generic_name' ? arityOf(findChild(nameNode, 'type_argument_list')!.text) : 0;
    if (instanceLikeReceiver(receiver)) return { name, receiver, args, typeArgs };
    // A first name the file does not declare reads as a type, unless a type around the call has a member of that name in another part or from a base class: then the receiver is a value after all, which only the resolver can tell.
    let root = receiver;
    while (root.type === 'member_access_expression') root = root.childForFieldName('expression')!;
    const types = root.type === 'identifier' && !isTypeParameterInScope(root.text, scopeOf(root)) ? membersAround(root).members : undefined;
    return types === undefined ? undefined : { name, receiver, args, typeArgs, member: { types, name: root.text, direct: root.id === receiver.id } };
  };

  // In a file of top-level statements, a bare `Program` (and `Program.X`) names that file's own implicit class: C# finds it in the global namespace before any using or any other project's type, so such a reference binds nothing else and is not emitted. A reference from inside a namespace block of the same file, where a nearer `Ns.Program` could win, is dropped too (silence, never a wrong edge).
  const ownsProgram = firstTopLevelStatement(file.tree.rootNode) !== undefined;
  const namesOwnProgram = (ref: string): boolean => ownsProgram && (ref === 'Program' || ref.startsWith('Program.'));

  /** Emit a plain reference descriptor (alias-unresolved). `enclosingNs` is precomputed from the
   *  node before the tree is destroyed; the alias/using expansion happens later, on assembly. */
  const pushRef = (ref: string, node: Node, line: number, rooted = false): void => {
    if (namesOwnProgram(ref)) return;
    refs.push({
      kind: 'plain',
      ref,
      line,
      rooted,
      enclosingNs: nsChain(node),
      at: node.startIndex,
      ...(rooted ? {} : enclosingTypes(node)),
    });
  };

  /** Emit an attribute descriptor (the two-reading `[Foo]`/`[FooAttribute]` group). */
  const pushAttribute = (
    written: string,
    suffixed: string | undefined,
    node: Node,
    line: number,
    rooted = false,
    alias?: string,
  ): void => {
    refs.push({
      kind: 'attr',
      written,
      suffixed,
      line,
      enclosingNs: nsChain(node),
      at: node.startIndex,
      rooted,
      ...(alias !== undefined ? { alias } : {}),
      ...(rooted || alias !== undefined ? {} : enclosingTypes(node)),
    });
  };

  /**
   * Emit references for every NAMED type a TYPE node carries, descending the type-constructor
   * shapes (generics, arrays, nullables, tuples) to their leaf named types. A bare `identifier`
   * or a `qualified_name` is one reference; a `generic_name`'s BASE name and each of its type
   * ARGUMENTS are references (an external container like `List`/`Task` resolves to nothing, so
   * it manufactures no edge); an
   * `array_type`/`nullable_type` unwraps to its element type; a `tuple_type` descends each
   * element. `predefined_type` (int, string, void, object…) and `implicit_type` (`var`) carry
   * no named dependency and are skipped.
   */
  const emitTypeNode = (typeNode: Node | null): void => {
    if (typeNode === null) return;
    switch (typeNode.type) {
      case 'identifier': {
        if (emitted.has(typeNode.id)) return;
        emitted.add(typeNode.id);
        if (isTypeParameterInScope(typeNode.text, scopeOf(typeNode))) return; // `T x;`, `GetRequiredService<T>()` inside `M<T>()` name the type parameter
        pushRef(typeNode.text, typeNode, typeNode.startPosition.row + 1);
        return;
      }
      case 'qualified_name': {
        if (emitted.has(typeNode.id)) return;
        emitted.add(typeNode.id);
        emitQualified(typeNode);
        return;
      }
      case 'alias_qualified_name': {
        // `global::A.B` rooted reference (R12): resolve the right side from the global root.
        const aliasField = typeNode.childForFieldName('alias');
        if (aliasField !== null && aliasField.text === 'global') {
          if (emitted.has(typeNode.id)) return;
          emitted.add(typeNode.id);
          // `global::Settings` / `global::Box<T>`: the one name is looked up in the global namespace only, never in an enclosing namespace or a using, and no type parameter shadows it, so it is a rooted reference; the type arguments are ordinary references.
          const nameField = typeNode.childForFieldName('name')!; // an alias-qualified name always has its name
          const generic = nameField.type === 'generic_name';
          pushRef(generic ? genericKey(nameField) : nameField.text, typeNode, typeNode.startPosition.row + 1, true);
          if (generic) emitTypeArguments(nameField);
          return;
        }
        // `S::Tail` where `S` is an in-file `using S = N;` namespace alias (B5): the leftmost
        // `S` is rewritten to its aliased FQN ON ASSEMBLY (the merged alias map decides emit-or-
        // not — an extern/unknown alias is dropped → R13 silence). The descriptor is emitted
        // UNCONDITIONALLY here, alias-unresolved; assembly drops it when the alias is absent.
        // (The original's conditional `emitted.add` here is unobservable — an
        // `alias_qualified_name` node is only ever reached once via `emitTypeNode`.)
        if (aliasField !== null) {
          const nameField = typeNode.childForFieldName('name');
          if (nameField !== null) {
            // `S::Gen<int>`: the tail is the generic's base name, and its type arguments are references of their own (188).
            const generic = nameField.type === 'generic_name' ? nameField : null;
            refs.push({
              kind: 'alias',
              aliasName: aliasField.text,
              tail: generic !== null ? genericKey(generic) : stripTypeArguments(stripGlobalQualifier(nameField.text)),
              line: typeNode.startPosition.row + 1,
              enclosingNs: nsChain(typeNode),
              at: typeNode.startIndex,
            });
            if (generic !== null) emitTypeArguments(generic);
          }
        }
        return;
      }
      case 'generic_name': {
        // The generic's BASE name is a type reference of its own (`Repository<Order>` depends on
        // `Repository` as much as on `Order`), resolved like a bare identifier. An external
        // container (`List`, `Task`, `Dictionary`) resolves to no in-repository declaration, so it stays
        // silent by the ordinary fail-to-silence rule. The type arguments are descended as before.
        if (emitted.has(typeNode.id)) return;
        emitted.add(typeNode.id);
        pushRef(genericKey(typeNode), typeNode, typeNode.startPosition.row + 1);
        emitTypeArguments(typeNode);
        return;
      }
      case 'array_type':
      case 'nullable_type':
      case 'pointer_type':
      case 'ref_type': {
        emitTypeNode(typeNode.childForFieldName('type'));
        return;
      }
      case 'tuple_type': {
        for (const el of typeNode.namedChildren) {
          if (el !== null && el.type === 'tuple_element') emitTypeNode(el.childForFieldName('type'));
        }
        return;
      }
      case 'function_pointer_type': {
        // `delegate*<Order, ref Item, Result>`: each parameter's type and the return type.
        for (const el of typeNode.namedChildren) {
          if (el !== null && el.type === 'function_pointer_parameter') emitTypeNode(el.childForFieldName('type'));
        }
        emitTypeNode(typeNode.childForFieldName('returns'));
        return;
      }
      default:
        // predefined_type / implicit_type / unrecognized → no named dep.
        return;
    }
  };

  /** Descend the type arguments of one `generic_name` (each argument is its own reference). */
  function emitTypeArguments(generic: Node): void {
    const args = findChild(generic, 'type_argument_list')!; // a generic_name always has its argument list
    for (const a of args.namedChildren) emitTypeNode(a);
  }

  /**
   * Emit one `qualified_name` reference. A qualified name that carries generic segments
   * (`Shop.Core.Repository<int>`, `Outer<int>.Inner`) is referenced by its PLAIN dotted name — the
   * type-argument lists stripped (`Shop.Core.Repository`, `Outer.Inner`), because declaration keys
   * carry no arity — and every type-argument list inside it is descended as its own references.
   * Without the strip the written text, `<…>` included, could never match a declaration key.
   */
  function emitQualified(q: Node): void {
    const line = q.startPosition.row + 1;
    const rooted = q.text.startsWith('global::');
    const parts = qualifiedNameParts(q);
    if (parts.alias !== undefined) {
      // `S::Core.Order` (188): the leftmost `S` is a using alias, rewritten on assembly to the namespace it names; an alias the map does not bind (an extern alias, `Lib::A.B`) is dropped there (R13).
      refs.push({ kind: 'alias', aliasName: parts.alias, tail: parts.name, line, enclosingNs: nsChain(q), at: q.startIndex });
    } else {
      pushRef(parts.name, q, line, rooted);
    }
    for (const g of parts.generics) emitTypeArguments(g);
  }

  /**
   * Emit the type a member-access EXPRESSION spells where only a type can stand (`Shop.Core.Customer`, `global::Shop.Customer`, `Shop.Core.Repo<int>`, `Outer<int>.Inner`: the grammar's reading of an unnamed tuple element beside a named one). The reference is the plain dotted name with every type-argument list stripped, rooted when it starts with `global::`, and each type-argument list is descended as references of its own. A chain led by a using alias (`S::Core.Customer`, which the grammar reads as a member access over `S::Core`) is the alias-qualified type it spells: its tail is rewritten on assembly onto the namespace the alias names, as a qualified name's is, and an alias the map does not bind (an extern alias) gives nothing. A chain that starts with a type parameter in scope (invalid C#, CS0704) emits nothing, and so does any other shape.
   */
  function emitMemberAccessType(access: Node, asReceiver = false): boolean {
    const segs: string[] = [];
    const generics: Node[] = [];
    let rooted = false;
    let alias: string | undefined;
    const collect = (n: Node): boolean => {
      switch (n.type) {
        case 'identifier':
          segs.push(n.text);
          return true;
        case 'generic_name':
          segs.push(genericKey(n));
          generics.push(n);
          return true;
        case 'member_access_expression':
          return collect(n.childForFieldName('expression')!) && collect(n.childForFieldName('name')!);
        case 'alias_qualified_name': {
          // The leftmost part of the chain: `global::` roots it, any other alias leads the tail it is rewritten onto.
          const aliasText = n.childForFieldName('alias')!.text;
          if (aliasText === 'global') rooted = true;
          else alias = aliasText;
          return collect(n.childForFieldName('name')!);
        }
        default:
          return false;
      }
    };
    if (!collect(access) || (!rooted && alias === undefined && isTypeParameterInScope(segs[0], scopeOf(access)))) return false;
    const line = access.startPosition.row + 1;
    if (alias !== undefined) refs.push({ kind: 'alias', aliasName: alias, tail: segs.join('.'), line, enclosingNs: nsChain(access), at: access.startIndex });
    else if (asReceiver) {
      if (namesOwnProgram(segs[0])) return true;
      refs.push({ kind: 'receiver', chain: segs, line, enclosingNs: nsChain(access), at: access.startIndex, rooted, ...(rooted ? {} : { ...enclosingTypes(access), ...membersAround(access) }) });
    } else pushRef(segs.join('.'), access, line, rooted);
    for (const g of generics) emitTypeArguments(g);
    return true;
  }

  /** A qualified name's plain dotted name, its type-argument lists stripped (`Shop.Core.Repository<int>` → `Shop.Core.Repository`, because declaration keys carry no arity), the using alias that leads it (`S::Core.Order` → `S`, with the tail `Core.Order`; a `global::` qualifier is not an alias and is stripped), and its generic segments, whose type arguments are references of their own. */
  function qualifiedNameParts(q: Node): { name: string; alias: string | undefined; generics: Node[] } {
    const segs: string[] = [];
    const generics: Node[] = [];
    let alias: string | undefined;
    const collect = (n: Node): void => {
      if (n.type === 'qualified_name') {
        collect(n.childForFieldName('qualifier')!);
        collect(n.childForFieldName('name')!);
      } else if (n.type === 'generic_name') {
        segs.push(genericKey(n));
        generics.push(n);
      } else if (n.type === 'alias_qualified_name') {
        // `global::A.B<T>` resolves from the root (R12); any other alias qualifier is the using alias the tail follows.
        const aliasText = n.childForFieldName('alias')!.text;
        if (aliasText !== 'global') alias = aliasText;
        collect(n.childForFieldName('name')!);
      } else {
        segs.push(n.text); // identifier
      }
    };
    collect(q);
    return { name: segs.join('.'), alias, generics };
  }

  /** The first child of the given type, or null. */
  function findChild(node: Node, childType: string): Node | null {
    for (const c of node.namedChildren) {
      if (c !== null && c.type === childType) return c;
    }
    return null;
  }

  /** Emit one named type written in a using directive's target as the directive reads it (a `target` descriptor): in the namespace body that holds the directive, nearest namespace first, no using directive or alias of that body taking part. A bare `Program` in a file of top-level statements names that file's own class and is not emitted, as in `pushRef`. */
  const pushTarget = (name: string, directive: Node, line: number): void => {
    if (namesOwnProgram(name)) return;
    const outer = outerUsings(info, scopeOf(directive));
    refs.push({ kind: 'target', fqn: name, line, enclosingNs: directiveBodyChain(info, directive, scopeOf(directive)), at: directive.startIndex, ...(outer.length > 0 ? { outer } : {}) });
  };

  /**
   * Emit every named type of a type written in a using directive's target, each read where the directive reads its target (C# spec §14.5.2): a bare, qualified or generic name is one `target` reference, a generic's type arguments are references of their own read the same way, and an array, pointer or nullable type and each tuple element are descended to their named types (C# 12 lets an alias name any type; the tuple element labels are not types). A name written after `global::` is rooted. A name written after a using alias (`S::A.B`) gives nothing: an alias of the same body never applies to a directive, and an alias of an outer body or an extern alias is not read (a silence); its type arguments still give theirs.
   */
  function emitDirectiveType(typeNode: Node, directive: Node): void {
    const line = typeNode.startPosition.row + 1;
    switch (typeNode.type) {
      case 'identifier':
        pushTarget(typeNode.text, directive, line);
        return;
      case 'generic_name':
        pushTarget(genericKey(typeNode), directive, line);
        emitDirectiveArguments(typeNode, directive);
        return;
      case 'qualified_name':
      case 'alias_qualified_name': {
        const parts = qualifiedNameParts(typeNode);
        if (parts.alias === undefined) {
          if (typeNode.text.startsWith('global::')) pushRef(parts.name, typeNode, line, true);
          else pushTarget(parts.name, directive, line);
        }
        for (const g of parts.generics) emitDirectiveArguments(g, directive);
        return;
      }
      case 'array_type':
      case 'nullable_type':
      case 'pointer_type':
        emitDirectiveType(typeNode.childForFieldName('type')!, directive);
        return;
      case 'tuple_type':
        for (const el of typeNode.namedChildren) {
          if (el!.type === 'tuple_element') emitDirectiveType(el!.childForFieldName('type')!, directive);
        }
        return;
      default:
        // predefined_type / function_pointer_type / unrecognized → no named type.
        return;
    }
  }

  /** The type arguments of one `generic_name` in a directive's target, each read as the directive reads its target. */
  function emitDirectiveArguments(generic: Node, directive: Node): void {
    for (const arg of findChild(generic, 'type_argument_list')!.namedChildren) emitDirectiveType(arg!, directive);
  }

  // ── `using static N.C;` / `global using static N.C;` TARGET edge (A8/A11) ────────────────
  // The directive imports the static MEMBERS of the concrete type `N.C`; the type itself is a real dependency of this file (never a namespace prefix: a sibling `N.Baz` is never imported). C# resolves it as a using alias target (spec §14.5.4, §14.5.2), so it is read where the directive stands: a directive below `namespace App;` or inside a namespace block reads `App.N.C` before `N.C`, one in the compilation unit reads from the global namespace, and no using directive beside it takes part. A generic type (`using static Repo<Order>;`) gives the edge to `Repo` and to each type argument. Emitted FIRST so the descriptor order, and thus the final edge order, is kept.
  walk(file.tree.rootNode, (node) => {
    if (node.type !== 'using_directive') return undefined;
    if (!hasTokenChild(node, 'static')) return false;
    const target = node.namedChildren.find((c) => c !== null && NAMESPACE_NODE_TYPES.has(c.type));
    if (target !== undefined && target !== null) emitDirectiveType(target, node);
    return false;
  });

  // ── The using alias target and the named types embedded in it (R7 + A6) ─────────────────
  // The alias TARGET: `using F = A.B.Foo;` gives the edge to its type whether or not any line uses F, as `using static` does. A generic target (`using R = A.Repo<Order>;`) gives the edge to its container, the type arguments stripped as the alias map strips them, and each type argument gives its own; C# 12 lets the target be any type (a tuple `(int, Mod.Customer)`, an array `Mod.Order[]`, a pointer, a nullable value), and each named type embedded in it is a reference. Every one of them is read where the directive reads its target (`emitDirectiveType`): a directive below `namespace App;` or inside a namespace block reads `App.Repo` before `Repo`, one in the compilation unit reads from the global namespace, and no using directive beside it takes part, each farther reading behind the nearer names the lookup would stop at.
  walk(file.tree.rootNode, (node) => {
    if (node.type !== 'using_directive') return undefined;
    const aliasName = node.childForFieldName('name');
    if (aliasName === null) return false; // not an alias directive
    const target = node.namedChildren.find((c) => c !== null && c.id !== aliasName.id);
    if (target === undefined || target === null) return false;
    // A plain name (`using M = Models;`, `using F = A.B.Foo;`) may name a namespace as much as a type, and a nearer namespace or type of its first name, which the lookup stops at, decides before any farther reading (`namespace App; using M = Models;` with a namespace `App.Models` and a global type `Models` names the namespace): each farther reading carries those nearer names (`shadow`), so the resolver voids it where the repository declares one.
    emitDirectiveType(target, node);
    return false;
  });

  walkWithParent(file.tree.rootNode, (node, parentOf) => {
    // Do NOT descend into directive/declaration HEADERS — their dotted names are the
    // imported namespace or the declared namespace name, not a symbol USE.
    if (node.type === 'using_directive' || node.type === 'file_scoped_namespace_declaration') {
      return false;
    }
    if (node.type === 'namespace_declaration') {
      const nameField = node.childForFieldName('name');
      if (nameField !== null) return undefined; // continue into the body for real uses
    }

    // ── Type-bearing positions (descend the type node to its named leaf types) ────────────
    // Field / property / local variable type.
    if (node.type === 'variable_declaration') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined; // keep descending — initializers may carry more references
    }
    // Parameter type.
    if (node.type === 'parameter') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    // Method / property / operator / indexer / delegate return type.
    if (
      node.type === 'method_declaration' ||
      node.type === 'property_declaration' ||
      node.type === 'delegate_declaration' ||
      node.type === 'operator_declaration' ||
      node.type === 'indexer_declaration' ||
      node.type === 'conversion_operator_declaration' ||
      node.type === 'event_declaration'
    ) {
      emitTypeNode(node.childForFieldName('type') ?? node.childForFieldName('returns'));
      return undefined;
    }
    // Local-function RETURN type (E17): `Foo Helper(Bar b) {…}`. The `type` field is the return
    // type; the parameter types are `parameter` nodes handled above. (An explicitly-typed lambda
    // parameter is also a `parameter` node — already covered — so the lambda needs no own case.)
    if (node.type === 'local_function_statement') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    // `catch (FooException e)` exception type (E18). The `catch_declaration` `type` field is the
    // exception type; the `name` field (the bound variable) is NOT a type reference.
    if (node.type === 'catch_declaration') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    // typeof(X) / sizeof(X) / default(X).
    if (
      node.type === 'typeof_expression' ||
      node.type === 'sizeof_expression' ||
      node.type === 'default_expression'
    ) {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    // `x as X` (right field) and cast `(X)x` (type field).
    if (node.type === 'as_expression') {
      emitTypeNode(node.childForFieldName('right'));
      return undefined;
    }
    if (node.type === 'cast_expression') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    // `is X` patterns: `o is X x` (declaration_pattern) / `o is X` (recursive_pattern) carry a
    // type; the bare-constant form `o is Z` is a constant_pattern over an identifier expression.
    if (node.type === 'declaration_pattern' || node.type === 'recursive_pattern') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    if (node.type === 'constant_pattern') {
      // `o is Z` — Z is an expression that, in a pattern position, names a type (or a constant).
      // Emit it as a candidate (a type reference if Z is a type; silence otherwise).
      const expr = node.namedChild(0);
      if (expr !== null && (expr.type === 'identifier' || expr.type === 'qualified_name' || expr.type === 'generic_name' || expr.type === 'alias_qualified_name')) emitTypeNode(expr);
      // A dotted name or a name with type arguments inside a dotted one (`o is App.Models.Order`, `Models.Order =>`, `A.B<int>.C`) is a member access to the grammar, and it names a type or a constant of one (`Status.Active`). C# binds its first name first: a type there ends the lookup (a nested type or a constant of it is read through that type), and only a namespace lets the next name be read. It is read as a receiver whose chain is every name, so the first name that binds a type gives the edge to that type and stops, and a type of the same spelling farther out is never reached.
      // The whole name is read here: the accesses inside it are no receivers of their own (read alone, `Data` of `o is Data.Row` would name a type `Data` where the nearer `Data` is a namespace).
      else if (expr !== null && expr.type === 'member_access_expression' && !declaredNames.has(leftmostName(expr)) && emitMemberAccessType(expr, true)) return false;
      return undefined;
    }
    // `o is Note[]`, `o is Note?`, `o is Pair<A, B>` after `is`: the grammar reads an array or nullable type as the operator's right operand, a type and not a pattern.
    if (node.type === 'is_expression') {
      emitTypeNode(node.childForFieldName('right'));
      return undefined;
    }
    // The explicit type of a query range variable: `from Row r in xs`, `join Cell c in ys on …`.
    if (node.type === 'from_clause' || node.type === 'join_clause') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    // Generic constraint `where T : Constraint`.
    if (node.type === 'type_parameter_constraint') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    // Attribute usage `[Foo]` / `[FooAttribute]` / generic `[Foo<Bar>]` (C#11, E9).
    if (node.type === 'attribute') {
      const nameField = node.childForFieldName('name');
      if (nameField === null || emitted.has(nameField.id)) return undefined;
      emitted.add(nameField.id);
      // A name written after `global::` (`[global::Foo]`, `[global::A.Foo]`, `[global::Gen<T>]`) is looked up from the global namespace only (R12), never in an enclosing namespace or a using; the right side of `global::` is the attribute's name. After a using alias (`[S::Foo]`, `[S::Gen<T>]`, `[S::Core.Mark]`, `using S = N;`) the rest is the attribute's name in the aliased namespace, rewritten on assembly as a type's `S::Tail` is (B5).
      const rooted = nameField.text.startsWith('global::');
      const aliasField = nameField.type === 'alias_qualified_name' ? nameField.childForFieldName('alias') : null;
      const alias = aliasField !== null && aliasField.text !== 'global' ? aliasField.text : undefined;
      const named = nameField.type === 'alias_qualified_name' ? nameField.childForFieldName('name') : nameField;
      // The C# attribute-naming convention: `[Foo]` may name `Foo` OR `FooAttribute`. Emit both readings as ONE group (the verbatim and the `Attribute`-suffixed form), so the dependency resolves whichever the declaring type is named.
      const emitAttribute = (written: string, at: Node, via = alias): void => {
        // A generic attribute's arity follows the suffix: `[Gen<T>]` reads ``Gen`1`` and ``GenAttribute`1``.
        const tick = written.lastIndexOf('`');
        const [base, arity] = tick > written.lastIndexOf('.') ? [written.slice(0, tick), written.slice(tick)] : [written, ''];
        const last = base.split('.').pop() ?? base;
        const suffixed = last.endsWith('Attribute') ? undefined : `${base}Attribute${arity}`;
        pushAttribute(written, suffixed, at, at.startPosition.row + 1, rooted, via);
      };
      if (named !== null && named.type === 'identifier') emitAttribute(named.text, nameField);
      else if (named !== null && named.type === 'qualified_name') {
        // An attribute behind a qualifier (`[A.Mark]`, `[global::A.Mark]`, `[A.Gen<Order>]`): the attribute is named by its plain dotted name, the `global::` qualifier and the type-argument lists stripped as a qualified type name's are, and each type argument is its own reference. The grammar nests a using alias at the deepest qualifier (`[S::Core.Mark]` is `(S::Core).Mark`), so `parts.alias` is that alias and `parts.name` the dotted name after it (`Core.Mark`), rewritten on assembly onto the aliased namespace, as `S::Core.Order` is in a type position.
        const parts = qualifiedNameParts(named);
        emitAttribute(parts.name, nameField, parts.alias);
        for (const g of parts.generics) emitTypeArguments(g);
      } else if (named !== null && named.type === 'generic_name') {
        // C#11 generic attribute `[Foo<Bar>]`: the attribute NAME is the `generic_name`'s base identifier (`Foo`, with the `Foo`/`FooAttribute` convention), and each type ARGUMENT (`Bar`) is its own real type reference.
        emitAttribute(genericKey(named), findChild(named, 'identifier')!); // a generic_name always has its identifier
        emitTypeArguments(named);
      }
      return undefined;
    }

    // ── Pre-existing reference forms ──────────────────────────────────────────────────────
    // Qualified references anywhere (outermost qualified_name): static-call receivers,
    // remaining type positions not covered above, etc. Skipped when already emitted by a
    // type-position handler, or when it is a namespace-declaration name, or a nested qualifier.
    if (node.type === 'qualified_name') {
      if (emitted.has(node.id)) return undefined;
      const parent = parentOf();
      if (parent !== null && parent.type === 'namespace_declaration') {
        const nm = parent.childForFieldName('name');
        if (nm !== null && nm.id === node.id) return undefined;
      }
      if (parent !== null && parent.type === 'qualified_name') return undefined;
      // A `qualified_name` that is itself the `qualifier` of an `alias_qualified_name` is part
      // of a `global::`-rooted name handled at the alias node — skip the bare qualifier.
      if (parent !== null && parent.type === 'alias_qualified_name') return undefined;
      emitted.add(node.id);
      emitQualified(node);
      return undefined;
    }

    // C# 14 extension block on a grammar that knows it (M2): `extension(Order order) { … }` —
    // the receiver's type is a type reference. The shipped pre-C# 14 grammar misreads the block
    // as a constructor named `extension`, whose receiver is then an ordinary `parameter` (handled
    // above); this case keeps the edge when the grammar is upgraded to the real node shape.
    if (node.type === 'receiver_parameter') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }

    // C# 14 null-conditional assignment `h?.Last = new Order();` on the shipped pre-C# 14 grammar:
    // the parser recovers as `h?.<ERROR Last = new> Order(…)`, a member binding whose name is
    // really the created type. Read that exact recovery shape (an ERROR child ending in the `new`
    // keyword, right before the binding's name) as the `new T()` it is. A grammar that knows the
    // form yields a plain object creation instead.
    if (node.type === 'member_binding_expression') {
      const recoveredNew = node.namedChildren.some(
        (c) => c !== null && c.type === 'ERROR' && c.childCount > 0 && c.child(c.childCount - 1)?.type === 'new',
      );
      const nm = node.childForFieldName('name');
      if (recoveredNew && nm !== null) emitTypeNode(nm);
      // A null-conditional generic call `sp?.Get<Ctx>()`: the type arguments, never the method name.
      else if (nm?.type === 'generic_name') emitTypeArguments(nm);
      return undefined;
    }

    // Member access through a TYPE name (M16): `Guard.NotNull(o)`, `OrderStatus.Paid`,
    // `Shop.Core.Guard.NotNull(o)`. Handled once, at the innermost access (the one whose receiver
    // is the leftmost identifier). A generic receiver `Result<int>.Ok()` is a type position.
    if (node.type === 'member_access_expression') {
      const expr = node.childForFieldName('expression');
      // A receiver written after `global::` (`global::Guard.NotNull(o)`, `global::Shop.Core.Guard.NotNull(o)`) is read from the global namespace only (R12): its name, not the alias-qualified node, leads the chain, and no name this file declares shadows it.
      const rootedName = expr !== null && expr.type === 'alias_qualified_name' && expr.childForFieldName('alias')!.text === 'global' ? expr.childForFieldName('name') : null;
      if (expr !== null && (expr.type === 'generic_name' || rootedName?.type === 'generic_name')) {
        emitTypeNode(expr);
      } else if (expr !== null && (rootedName?.type === 'identifier' || (expr.type === 'identifier' && !declaredNames.has(expr.text) && !isTypeParameterInScope(expr.text, scopeOf(expr)))) && !insideNameof(node)) {
        const rooted = rootedName !== null;
        const chain = [(rootedName ?? expr).text];
        let cur = node;
        // Walk outward while this access is itself the receiver of a further access (a member
        // access only ever nests through its `expression`, and the walk carries the accesses it
        // nests in as `scope.access`): every name but the outermost accessed member is a receiver
        // segment. A generic segment (`A.B<int>.C`) ends the dotted chain.
        for (let outer = scopeOf(node).access; outer !== null; outer = outer.outer) {
          const nm = cur.childForFieldName('name')!;
          if (nm.type !== 'identifier') break;
          chain.push(nm.text);
          cur = outer.node;
        }
        if (!namesOwnProgram(chain[0])) refs.push({
          kind: 'receiver',
          chain,
          line: expr.startPosition.row + 1,
          enclosingNs: nsChain(node),
          at: node.startIndex,
          rooted,
          ...(rooted ? {} : { ...enclosingTypes(node), ...membersAround(node) }),
        });
      }
      // A generic member `sp.GetRequiredService<Ctx>()`, `Substitute.For<Ctx>()`: its type arguments are type references; the member name itself is a method, never a type.
      const member = node.childForFieldName('name')!;
      if (member.type === 'generic_name') emitTypeArguments(member);
      return undefined;
    }

    // Extension-method call on an instance-like receiver (m27): `builder.Services.AddInfrastructure()`.
    if (node.type === 'invocation_expression') {
      // A generic method called by its simple name, `Resolve<Ctx>()`: the type arguments are type references; the method name is not a type.
      const fn = node.childForFieldName('function')!;
      if (fn.type === 'generic_name') emitTypeArguments(fn);
      const call = extensionCall(node);
      if (call !== undefined && !insideNameof(node)) {
        refs.push({
          kind: 'ext',
          name: call.name,
          line: node.startPosition.row + 1,
          enclosingNs: nsChain(node),
          at: node.startIndex,
          ...extensionReceiver(node, call),
          ...(call.member === undefined ? {} : { member: call.member }),
        });
      }
      return undefined;
    }

    // Bare type identifiers in base_list entries.
    if (node.type === 'base_list') {
      for (const c of node.namedChildren) emitTypeNode(c);
      return undefined;
    }

    // Bare / generic / qualified type in `new T()`.
    if (node.type === 'object_creation_expression') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }

    // The element type of `new T[n]` and `stackalloc T[n]` (an array_type, unwrapped through every rank) and the explicitly typed iteration variable of `foreach (T x in …)`. `var` is an implicit_type and names nothing, and so does the implicit `stackalloc[] { … }`; a deconstructing `foreach ((T a, U b) in …)` has no `type` field, its elements are declaration expressions of their own.
    if (node.type === 'array_creation_expression' || node.type === 'stackalloc_expression' || node.type === 'foreach_statement') {
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }
    // A tuple type with named elements as a type argument, followed by arguments or an initializer (`new List<(Order Item, int Index)>(n)`, `new List<(Order Item, int Index)> { … }`, `Make<(Order Item, int Index)>(n)`): the grammar reads it as `G < (Order Item, int Index) > …`, comparisons around a tuple of declaration expressions. A tuple of declarations is never a valid operand, so after `<` it can only be that tuple type: each named element's type is read (its name never is), and so is a bare unnamed element beside a named one.
    // One generic level deeper or more (`new List<Page<(Order Item, int Index)>>(n)`), the closing `>>` or `>>>` is a shift, which binds tighter than `<`: the grammar reads `(G < Page) < ((Order Item, int Index) >> (n))`, the tuple the shift's left operand. It is the same tuple type, read the same way, and each enclosing generic's name, the right operand of a `<` further left (one per `>` beyond the first), is a type reference too.
    if (node.type === 'binary_expression' && node.childForFieldName('operator')!.type === '<') {
      const right = node.childForFieldName('right')!;
      const shift = right.type === 'binary_expression' && /^>>>?$/.test(right.childForFieldName('operator')!.type) ? right : undefined;
      const tuple = shift?.childForFieldName('left') ?? right;
      const elements = tuple.type === 'tuple_expression' ? tuple.namedChildren.map((arg) => arg!.namedChild(0)!) : [];
      if (elements.some((e) => e.type === 'declaration_expression')) {
        for (const e of elements) {
          if (e.type === 'declaration_expression') emitTypeNode(e.childForFieldName('type'));
          // An unnamed element beside a named one is a type spelled as the grammar's expression: a bare, generic or `global::` name goes the type way, a dotted one is read as the qualified name it spells (177).
          else if (e.type === 'identifier' || e.type === 'generic_name' || e.type === 'alias_qualified_name') emitTypeNode(e);
          else if (e.type === 'member_access_expression') emitMemberAccessType(e);
        }
        // Each generic around the tuple holds it, or the generic that holds it, as its one type argument, so its key has the arity 1 (`List<(Order Item, int Index)>` is ``List`1``).
        const emitHolder = (name: Node): void => {
          if (emitted.has(name.id)) return;
          emitted.add(name.id);
          if (!isTypeParameterInScope(name.text, scopeOf(name))) pushRef(`${name.text}\`1`, name, name.startPosition.row + 1);
        };
        let generic = node.childForFieldName('left')!;
        for (let level = 1; shift !== undefined && level < shift.childForFieldName('operator')!.type.length; level++) {
          if (generic.type !== 'binary_expression' || generic.childForFieldName('operator')!.type !== '<') break;
          const name = generic.childForFieldName('right')!;
          if (name.type === 'identifier') emitHolder(name);
          generic = generic.childForFieldName('left')!;
        }
        // The created generic of `new List<(Order Item, int Index)>(n)`, which the grammar reads as `new List` compared with the tuple: it holds the one tuple type argument.
        if (generic.type === 'object_creation_expression') {
          const created = generic.childForFieldName('type')!;
          if (created.type === 'identifier') emitHolder(created);
        }
      }
      return undefined;
    }
    // A declaration expression `out T x`, or an element of a deconstruction target `(T a, U b) = …`. Anywhere else the node is the grammar's reading of a comparison pair (`F(i < A, j > B)` as a declaration of `i<A, j> B`, `F(x.i < A, j > B)` as one of `x.i<A, j> B`), which names no type: nothing under it is read, or the general qualified-name reading below would still take `x.i` and its "type arguments" for types.
    if (node.type === 'declaration_expression') {
      if (!declaresVariable(node, scopeOf(node))) {
        // The comparison reading (177): `F(x < Limits.Max, y > z)` is two comparisons, so each type argument that is a member access `Limits.Max` is a receiver of its own, `Limits` being a type unless this file declares it as a value.
        const type = node.childForFieldName('type');
        const args = type?.type === 'generic_name' ? findChild(type, 'type_argument_list') : null;
        for (const arg of (args?.namedChildren ?? []) as Node[]) {
          const qualifier = arg.type === 'qualified_name' ? arg.childForFieldName('qualifier') : null;
          const chainText = qualifier !== null ? dottedName(qualifier) : undefined;
          if (chainText === undefined) continue;
          const head = chainText.split('.')[0];
          if (declaredNames.has(head) || isTypeParameterInScope(head, scopeOf(qualifier!))) continue;
          refs.push({
            kind: 'receiver',
            chain: chainText.split('.'),
            line: arg.startPosition.row + 1,
            enclosingNs: nsChain(arg),
            at: arg.startIndex,
            rooted: false,
            ...enclosingTypes(arg),
            ...membersAround(arg),
          });
        }
        return false;
      }
      emitTypeNode(node.childForFieldName('type'));
      return undefined;
    }

    return undefined;
  });

  return { fileNs, scope, refs, fileLocalTypes: fileLocalTypeKeys(file.tree.rootNode, fileNs), ...(lists.length > 0 ? { lists } : {}), ...(receiverTypes.length > 0 ? { receiverTypes } : {}) };
}

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
export function assembleCsharpCandidates(
  extract: CsharpExtract,
  options: CsharpUsesOptions = {},
): DetectedDep[] {
  const out: DetectedDep[] = [];
  const { scope, refs } = extract;

  /** True when the reading `key` names a type this file keeps to itself, or a member of one (C#11 file-local types). Such a type is found at its lookup level, where it removes the public types of that level, so a candidate group ends there. A dotted key is read with each dot after a type boundary as the `+` of a nested type. */
  const fileLocal = new Set(extract.fileLocalTypes);
  const isFileLocalReading = (key: string): boolean => {
    if (fileLocal.size === 0) return false;
    const segments = key.split('.');
    for (let end = 1; end <= segments.length; end++) {
      for (let dots = 1; dots <= end; dots++) {
        const head = segments.slice(0, dots).join('.');
        const rest = segments.slice(dots, end);
        if (fileLocal.has(rest.length === 0 ? head : `${head}+${rest.join('+')}`)) return true;
      }
    }
    return false;
  };
  /** A type around a reference as its readings name it: a type the file keeps to itself says so (`fileTypeRef`). */
  const typeRef = (typeKey: string): string => (fileLocal.has(typeKey) ? fileTypeRef(typeKey) : typeKey);

  // Project-wide `global using` aliases (A12): a `global using Alias = N.Type;` declared in ANY
  // file is usable in EVERY file. Merge the aggregated set BELOW this file's own aliases — a
  // file-local alias of the same name takes precedence (the local directive wins for this file).
  // Copy first so the cached extract's `scope.aliases` is never mutated (it may be reused across
  // option variants / runs).
  //
  // M7: when the project-wide set maps one alias name to 2+ DISTINCT targets (two files of what
  // the pass could only treat as one project each declare `global using Money = …;` with a
  // different right-hand side), no single target is the binding — picking one would be an
  // order-dependent wrong edge. Such a name (unless this file declares its own alias of that name)
  // is AMBIGUOUS: every reference led by it stays silent.
  const aliases = new Map(scope.aliases);
  const projectAliasTargets = new Map<string, Set<string>>();
  for (const [name, fqn] of options.projectGlobalUsingAliases ?? []) {
    let targets = projectAliasTargets.get(name);
    if (!targets) {
      targets = new Set();
      projectAliasTargets.set(name, targets);
    }
    targets.add(fqn);
  }
  const projectAliases = new Map<string, string>();
  const ambiguousAliases = new Set<string>();
  for (const [name, targets] of projectAliasTargets) {
    if (targets.size === 1) projectAliases.set(name, [...targets][0]);
    if (aliases.has(name)) continue;
    if (targets.size === 1) aliases.set(name, [...targets][0]);
    else ambiguousAliases.add(name);
  }

  // The using-import binding level of the compilation unit (R2/R9: an UNORDERED set at one scope): the plain usings outside every namespace body + this file's own `global using` + the project-wide aggregated global usings, all at one tier, read after every enclosing namespace. Sorted by code point so the candidate display order is deterministic and never load-bearing; the CS0104 set rule (≥2 distinct files → silence) is order-independent. A plain using inside a namespace body belongs to that body's level instead (`levelsAt`).
  const usingPrefixes = [
    ...new Set([
      ...scope.prefixDecls.filter((d) => d.body.length === 0).map((d) => d.ns),
      ...scope.globalPrefixes,
      ...(options.projectGlobalUsings ?? []),
    ]),
  ].sort();

  // The types the using static directives of the compilation unit name: this file's own, its global ones and the project's. They import nested types and extension methods at the same level as the usings above.
  const compilationUnitStatics = [
    ...new Set([
      ...scope.staticDecls.filter((d) => d.body.length === 0).map((d) => d.fqn),
      ...scope.globalStatics,
      ...(options.projectGlobalStatics ?? []),
    ]),
  ].sort();

  // The plain usings, using statics and aliases that sit in a namespace body, the only ones whose reach depends on where a reference stands.
  const blockPrefixes = scope.prefixDecls.filter((d) => d.body.length > 0);
  const blockStatics = scope.staticDecls.filter((d) => d.body.length > 0);
  const blockAliases = [...scope.aliasDecls].flatMap(([name, decls]) => decls.filter((d) => d.body.length > 0).map((d) => ({ name, d })));

  /** The using directives of the namespace declarations around a reference at `at` whose enclosing namespaces are `enclosingNs`, innermost first, those without any left out: each plain using, each using static and each alias whose block holds `at`, at the namespace of the body that holds it. A using directive reaches the references of its own body, nested bodies included, and of no other (C# spec §14.5.1). */
  const levelsAt = (enclosingNs: string[], at: number): OuterUsings[] => {
    const byNs = new Map<string, OuterUsings>();
    const level = (ns: string): OuterUsings => {
      let l = byNs.get(ns);
      if (l === undefined) {
        l = { ns, prefixes: [], aliases: [], statics: [] };
        byNs.set(ns, l);
      }
      return l;
    };
    for (const d of blockPrefixes) if (at >= d.start && at < d.end) level(d.body[0]).prefixes.push(d.rooted ? `global::${d.ns}` : d.ns);
    for (const { name, d } of blockAliases) if (at >= d.start && at < d.end) level(d.body[0]).aliases.push(name);
    for (const d of blockStatics) if (at >= d.start && at < d.end) level(d.body[0]).statics.push(d.rooted ? `global::${d.fqn}` : d.fqn);
    return enclosingNs.filter((ns) => byNs.has(ns)).map((ns) => byNs.get(ns)!);
  };

  /** The directive of the alias `name` declared in a body of namespace `ns` whose block holds `at`. */
  const aliasAt = (name: string, ns: string, at: number): (typeof blockAliases)[number]['d'] | undefined =>
    (scope.aliasDecls.get(name) ?? []).find((d) => d.body[0] === ns && at >= d.start && at < d.end);

  /**
   * The namespaces a namespace name written in a using directive may stand for (`name`, read in a body whose enclosing namespaces are `chain`, innermost first, with the using directives of the declarations around that body in `levels`), in C# lookup order (spec §14.5.3, §7.8.1): at each namespace of the chain, nearest first, its member namespace of that name; where a declaration of that namespace holds an alias of the name's first segment, that alias decides, read where its own directive reads its target; the global namespace last. A name written after `global::` is read from the global namespace only. Each reading but the first carries the nearer names of the first segment the lookup would stop at (`shadow`), so a nearer namespace the repository declares voids it.
   */
  const namespaceReadings = (chain: string[], levels: OuterUsings[], at: number, name: string): Array<{ key: string; shadow: string[] }> => {
    // A namespace written after `global::` is read from the global namespace only, whatever is nearer (C# spec §14.8.1).
    if (name.startsWith('global::')) return [{ key: name.slice('global::'.length), shadow: [] }];
    const lead = name.split('.')[0];
    const out: Array<{ key: string; shadow: string[] }> = [];
    const shadow: string[] = [];
    for (const ns of chain) {
      out.push({ key: `${ns}.${name}`, shadow: [...shadow] });
      shadow.push(`${ns}.${lead}`);
      if (!levels.some((o) => o.ns === ns && o.aliases.includes(lead))) continue;
      const d = aliasAt(lead, ns, at);
      if (d !== undefined) {
        const target = `${d.fqn}${name.slice(lead.length)}`;
        const read = d.rooted ? [{ key: target, shadow: [] }] : namespaceReadings(d.body, d.outer, d.start, target);
        for (const r of read) out.push({ key: r.key, shadow: [...shadow, ...r.shadow] });
      }
      return out;
    }
    out.push({ key: name, shadow });
    return out;
  };

  /** One CS0104 set: the readings `key(namespace)` of each namespace the plain usings of `levels[k]` import (each read where that declaration stands: `chain` starts at its namespace, and the declarations farther out take part), behind the nearer names `base`. `nestedOnly` is carried on each member when given (R4). When `imported` is given, the set also holds the readings `imported.key(type)` of each type the `using static` directives of `levels[k]` name (a nested type, or an extension method, of the type; C# spec §14.5.4), the type read where its directive stands without the `using static` directives farther out (a limit: a type only an outer `using static` reaches is not seen there, which keeps a deep nest of them from multiplying the readings). */
  const levelSet = (chain: string[], levels: OuterUsings[], k: number, at: number, key: (ns: string) => string, nestedOnly: boolean | undefined, base: string[], imported?: StaticImport): SymbolSetMember[] => {
    const set: SymbolSetMember[] = [];
    for (const p of levels[k].prefixes) {
      for (const r of namespaceReadings(chain, levels.slice(k + 1), at, p)) {
        const shadow = [...base, ...r.shadow];
        set.push({ symbolKey: key(r.key), ...(nestedOnly === undefined ? {} : { nestedOnly }), ...(shadow.length > 0 ? { shadow } : {}) });
      }
    }
    if (imported === undefined) return set;
    const plain = levels.slice(k + 1).map((o) => (o.statics.length === 0 ? o : { ...o, statics: [] }));
    for (const s of levels[k].statics) {
      const rooted = s.startsWith('global::');
      for (const h of typeReadings(rooted ? [] : chain, rooted ? [] : plain, at, rooted ? s.slice('global::'.length) : s)) {
        for (const m of h.set ?? [h]) {
          set.push({ symbolKey: imported.key(m.symbolKey), ...(imported.nestedOnly ? { nestedOnly: true } : {}), shadow: [...base, ...(m.shadow ?? [])] });
        }
      }
    }
    return set;
  };

  /** `hints` read behind the nearer names `shadow`: each hint, and each member of its set, gains them. */
  const behind = (hints: SymbolHint[], shadow: string[]): SymbolHint[] => {
    const sets = new Map<SymbolSetMember[], SymbolSetMember[]>();
    const moved = (set: SymbolSetMember[]): SymbolSetMember[] => {
      let m = sets.get(set);
      if (m === undefined) {
        m = set.map((s) => ({ ...s, shadow: [...shadow, ...(s.shadow ?? [])] }));
        sets.set(set, m);
      }
      return m;
    };
    return hints.map((h) => (h.set === undefined ? { ...h, shadow: [...shadow, ...(h.shadow ?? [])] } : { ...h, set: moved(h.set) }));
  };


  /** The alias `name` as a reference inside `enclosingNs` sees it, or undefined when no alias of that name is in scope there. An alias is in scope only inside the namespace body that holds its directive (the compilation unit holds every body), and where several directives of one name reach the use the nearest body wins; `bodyNs` the namespace of the body itself (undefined for the compilation unit). A project-wide `global using` alias sits in the compilation unit and reads its target from the root. */
  const viewAlias = (name: string, enclosingNs: string[], at: number): AliasView | undefined => {
    // A name this file declares as an alias is read from its own directives: the one whose block is the innermost around the use. A block-only alias does not hide a project-wide `global using` alias of the same name, which sits in the compilation unit.
    let best: AliasView | undefined;
    let bestStart = -1;
    for (const d of scope.aliasDecls.get(name) ?? []) {
      if (at < d.start || at >= d.end || d.start < bestStart) continue;
      const bodyNs = d.body[0];
      const index = bodyNs === undefined ? enclosingNs.length : enclosingNs.indexOf(bodyNs);
      if (index < 0) continue;
      best = { target: d.fqn, chain: d.rooted ? [] : d.body, outer: d.rooted ? [] : d.outer, bodyNs, at: d.start };
      bestStart = d.start;
    }
    if (best !== undefined) return best;
    const projectTarget = projectAliases.get(name);
    return projectTarget === undefined ? undefined : { target: projectTarget, chain: [], outer: [], bodyNs: undefined, at: 0 };
  };

  /**
   * The readings of a type name written in a using directive's target (`name`, read in the body whose enclosing namespaces are `chain`, innermost first, with the using directives of the declarations around that body in `outer` and `at` a position inside that body), in C# lookup order (spec §7.8.1, §14.5.2): at each namespace of the chain, nearest first, the member of that namespace; then, where a declaration of that namespace holds using directives, an alias of the name's first segment decides there, read where its own directive reads its target; or else the types of the namespaces its plain usings import (each namespace read where that declaration stands, `namespaceReadings`) and the nested types of the types its `using static` directives name form one CS0104 set (a dotted name binds only a nested type under them, R4); and the global namespace last. Every reading but the first carries the nearer namespaces or types of the first segment the lookup would stop at (`shadow`). The using directives of the body that holds the directive take no part, and neither do those of the compilation unit (a silence: C# reads them only after the global namespace).
   */
  const typeReadings = (chain: string[], outer: OuterUsings[], at: number, name: string): SymbolHint[] => {
    const lead = name.split('.')[0];
    const nested = name.includes('.');
    const hints: SymbolHint[] = [];
    const seen = new Set<string>();
    const add = (hint: SymbolHint): void => {
      if (seen.has(hint.symbolKey)) return;
      seen.add(hint.symbolKey);
      hints.push(hint);
    };
    const shadow: string[] = [];
    const reading = (symbolKey: string): SymbolHint => (shadow.length > 0 ? { kind: 'symbol', symbolKey, shadow: [...shadow] } : { kind: 'symbol', symbolKey });
    for (const [i, ns] of chain.entries()) {
      add(reading(`${ns}.${name}`));
      shadow.push(`${ns}.${lead}`);
      const k = outer.findIndex((o) => o.ns === ns);
      if (k < 0) continue;
      if (outer[k].aliases.includes(lead)) {
        const d = aliasAt(lead, ns, at);
        if (d !== undefined) {
          const target = `${d.fqn}${name.slice(lead.length)}`;
          const read: SymbolHint[] = d.rooted ? [{ kind: 'symbol', symbolKey: target }] : typeReadings(d.body, d.outer, d.start, target);
          for (const h of behind(read, shadow)) add(h);
        }
        return hints;
      }
      const from = chain.slice(i);
      // A `using static T;` imports the nested types of T: the member `T.<name>` read as a nested type only, wherever T is read.
      const set = levelSet(from, outer, k, at, (p) => `${p}.${name}`, nested, shadow, { key: (t) => `${t}.${name}`, nestedOnly: true });
      for (const m of set) add({ kind: 'symbol', symbolKey: m.symbolKey, nestedOnly: m.nestedOnly, set });
    }
    add(reading(name));
    return hints;
  };

  /** The readings of an alias target (plus a dotted `tail`): where its directive reads it (`typeReadings`). */
  const aliasTargetHints = (view: AliasView, tail: string): SymbolHint[] => typeReadings(view.chain, view.outer, view.at, `${view.target}${tail}`);

  /** The readings up to the first that names a file-local type of this file, or a set one member of which does: a name found there ends the lookup (see `isFileLocalReading`). */
  const beforeFileLocal = (hints: TargetHint[]): TargetHint[] => {
    const end = hints.findIndex((h) => h.kind === 'symbol' && (isFileLocalReading(h.symbolKey) || (h.set ?? []).some((m) => isFileLocalReading(m.symbolKey))));
    return end < 0 ? hints : hints.slice(0, end);
  };

  /** Push ONE group of readings in order (an alias rewrite, `S::Tail`): the first that binds wins. */
  const pushHints = (candidates: TargetHint[], line: number): void => {
    const kept = beforeFileLocal(candidates);
    if (kept.length > 0) out.push({ candidates: kept, kind: 'import', line });
  };

  /**
   * Build and push ONE ordered candidate group for a reference whose written text is `ref` (a
   * dotted partial name or a bare identifier) with its precomputed `enclosingNs` chain. Candidate
   * order = C# name-binding order:
   *   [nested types of the enclosing types, innermost first] ++ [alias-expansion?] ++ [enclosing-ns chain innermost→outermost]
   *                       ++ [verbatim / bare top-level] ++ [compilation-unit using-prefix block, sorted]
   * with resolution refinements attached as hint metadata (invisible to the group's display
   * shape, which reads only `symbolKey`):
   *   - the alias candidate carries a CO-DEFINITION set (R8): the alias target plus the same
   *     simple name's enclosing-ns + verbatim readings — if the alias AND a same-named member
   *     both resolve (2+ distinct files), the simple name is ambiguous → silence.
   *   - the using-prefix candidates form ONE CS0104 set (R9): classification resolves the union
   *     of all using-prefix expansions; 2+ distinct files → ambiguous → silence.
   *   - a using-prefix candidate on a MULTI-segment ref is `nestedOnly` (R4): `using A;` + `B.T`
   *     may bind `A.B+T` (B a type, T nested) but NEVER the dotted `A.B.T` (B a sub-namespace).
   */
  const pushRef = (ref: string, enclosingNs: string[], line: number, rooted: boolean, at: number, types: readonly string[] = [], unless?: CsharpCondition[], steps?: number[]): boolean => {
    // A `global::`-rooted reference (R12) is resolved as a fully-qualified name FROM THE ROOT —
    // no alias, no enclosing-namespace, no using-prefix expansion; the verbatim is the sole
    // candidate.
    if (rooted) {
      if (isFileLocalReading(ref)) return true;
      const candidates: TargetHint[] = [{ kind: 'symbol', symbolKey: ref }];
      // `global::Program` names the global `Program`, which may be the implicit class of a file of top-level statements (the fallback after an explicit one).
      if (ref === 'Program') candidates.push({ kind: 'symbol', symbolKey: IMPLICIT_PROGRAM_KEY });
      out.push({ candidates, kind: 'import', line });
      steps?.push(...candidates.map(() => 0));
      return false;
    }

    // The nested types of each enclosing type, innermost type first, from every part of a partial type: C# reads them before any namespace, alias or using (spec §7.6.1, §12.8.4). A dotted `X.Y` reads `<Outer>+X.Y`, which the resolver's guarded split binds as `<Outer>+X+Y`.
    const nestedReadings: TargetHint[] = types.map((t) => ({ kind: 'symbol', symbolKey: `${t}+${ref}`, within: typeRef(t), ...(unless === undefined ? {} : { unless }) }));
    // A nested type of a file-local type is found there, before any namespace: the group ends at it.
    const localNested = nestedReadings.findIndex((h) => isFileLocalReading((h as SymbolHint).symbolKey));
    if (localNested >= 0) nestedReadings.length = localNested;

    const lead = ref.split('.')[0];
    if (ambiguousAliases.has(lead)) {
      // M7: an alias with 2+ project-wide targets → silence, unless a nested type of an enclosing type, which comes before every alias, binds.
      if (nestedReadings.length > 0) out.push({ candidates: nestedReadings, kind: 'import', line });
      steps?.push(...nestedReadings.keys());
      return localNested >= 0;
    }
    const multi = ref.includes('.');
    const aliasView = viewAlias(lead, enclosingNs, at);

    const candidates: TargetHint[] = [...nestedReadings];
    // The step of the lookup each candidate is read at (`steps`, when asked for): one per enclosing type, then for each enclosing namespace its own members and then what its using directives import, then the compilation unit's alias, the global namespace, the compilation unit's usings and the implicit `Program`. The steps depend on where the reference stands and on its first name alone, so the readings of `A` and of `A.B` at one place can be laid side by side (a receiver, read one prefix at a time). No reading stands behind a nearer namespace of the first name (`shadow`): whether the calling project sees that namespace is not known here, so a prefix that binds nothing at a step lets the next step be read.
    let step = nestedReadings.length;
    steps?.push(...nestedReadings.keys());
    const pushed = new Set<string>();
    // Set once a reading names a file-local type: nothing farther is a candidate.
    let ended = localNested >= 0;
    const add = (hint: TargetHint): void => {
      if (ended) return;
      if (hint.kind === 'symbol') {
        if (isFileLocalReading(hint.symbolKey)) {
          ended = true;
          return;
        }
        if (pushed.has(hint.symbolKey)) return;
        pushed.add(hint.symbolKey);
      }
      candidates.push(hint);
      steps?.push(step);
    };
    const addSet = (set: SymbolSetMember[]): void => {
      if (set.some((m) => isFileLocalReading(m.symbolKey))) ended = true;
      for (const m of set) add({ kind: 'symbol', symbolKey: m.symbolKey, nestedOnly: m.nestedOnly, set });
    };

    const pushAlias = (view: AliasView): void => {
      // The alias rewrites the leftmost segment; the dotted tail follows it. Its target is read where the directive reads it, nearest namespace of the body first (C# spec §14.5.2).
      const tail = ref.slice(lead.length); // leading '.', or '' for a bare ref
      // Co-definition set (R8): a member named like the alias in the SAME body (CS0576) competes with
      // it — 2+ of these resolving = ambiguous → silence. A member of an outer namespace loses to the alias.
      const sameBody = view.bodyNs === undefined ? ref : `${view.bodyNs}.${ref}`;
      for (const hint of aliasTargetHints(view, tail)) {
        // A reading through an outer using is already a CS0104 set; the same-body member joins it.
        const own: SymbolSetMember[] = hint.set ?? [{ symbolKey: hint.symbolKey, ...(hint.shadow === undefined ? {} : { shadow: hint.shadow }) }];
        const coDef: SymbolSetMember[] = own.some((m) => m.symbolKey === sameBody) ? own : [...own, { symbolKey: sameBody }];
        add({ ...hint, set: coDef });
      }
    };

    // Each enclosing namespace, innermost first: an alias of its body (whose own member competes with it, R8), its member, then the types the plain usings of its declarations import (one CS0104 set; a multi-segment ref is nested-split-only under them, R4), before the next namespace outward (C# spec §7.8.1). A member of a namespace nearer than the alias's body hides the alias.
    const levels = levelsAt(enclosingNs, at);
    for (const [i, ns] of enclosingNs.entries()) {
      if (aliasView !== undefined && aliasView.bodyNs === ns) pushAlias(aliasView);
      add({ kind: 'symbol', symbolKey: `${ns}.${ref}` });
      step++;
      const k = levels.findIndex((o) => o.ns === ns);
      if (k >= 0) addSet(levelSet(enclosingNs.slice(i), levels, k, at, (p) => `${p}.${ref}`, multi, [], { key: (t) => `${t}.${ref}`, nestedOnly: true }));
      step++;
    }
    // An alias of the compilation unit, or a project-wide `global using` alias, comes after every enclosing namespace.
    if (aliasView !== undefined && aliasView.bodyNs === undefined) pushAlias(aliasView);
    step++;

    // The global namespace's own member (the verbatim reading), before the using directives of the compilation unit, which is the declaration of the global namespace (C# spec §7.8.1): `using Lib;` beside a global `Order` leaves `Order` the global type.
    add({ kind: 'symbol', symbolKey: ref });
    step++;

    // The using-prefix expansions of the compilation unit and the project (one CS0104 set), the last of the explicit readings, with the nested types the using static directives of the compilation unit and the project import (a type read from the global namespace).
    addSet([...usingPrefixes.map((p) => ({ symbolKey: `${p}.${ref}`, nestedOnly: multi })), ...compilationUnitStatics.map((t) => ({ symbolKey: `${t}.${ref}`, nestedOnly: true }))]);

    // A bare `Program` may name the implicit class of a file of top-level statements, but only when no explicit reading binds: its fallback key comes after all of them.
    step++;
    if (ref === 'Program') add({ kind: 'symbol', symbolKey: IMPLICIT_PROGRAM_KEY });

    // Where the name stands as a value's would (the receiver of a member access), every reading holds only while the name is no member of a type around it (`unless`).
    if (unless !== undefined) for (const c of candidates) (c as SymbolHint).unless = unless;
    if (candidates.length > 0) out.push({ candidates, kind: 'import', line });
    return ended;
  };

  /** Emit a two-reading attribute group (`written` and its `Attribute`-suffixed form) as ONE
   *  ordered group, each reading carrying its own alias/enclosing-ns/using/verbatim candidates,
   *  concatenated so the verbatim short form is reached only when nothing nearer binds. */
  const pushAttribute = (
    written: string,
    suffixed: string | undefined,
    enclosingNs: string[],
    line: number,
    rooted: boolean,
    at: number,
    types: readonly string[] = [],
  ): void => {
    const before = out.length;
    const writtenLocal = pushRef(written, enclosingNs, line, rooted, at, types);
    const writtenGroup = out.splice(before)[0]?.candidates ?? [];
    const suffixedLocal = suffixed !== undefined && pushRef(suffixed, enclosingNs, line, rooted, at, types);
    const suffixedGroup = suffixed === undefined ? undefined : (out.splice(before)[0]?.candidates ?? []);
    pushReadings(written, writtenGroup, suffixedGroup, writtenLocal || suffixedLocal, line);
  };

  /**
   * Push the one reference an attribute is, from the group of each of its readings. C# resolves the written name and the suffixed name each by itself and takes the one that is an attribute class (spec §23.3), so the two groups travel apart in one candidate (`attribute`) and the resolver chooses. Where a reading ends at a type this file keeps to itself (`local`), which no key names, the readings stay one ordered group as before: the first that binds wins.
   */
  const pushReadings = (written: string, writtenGroup: TargetHint[], suffixedGroup: TargetHint[] | undefined, local: boolean, line: number): void => {
    if (local) {
      const before = out.length;
      for (const candidates of [writtenGroup, suffixedGroup ?? []]) if (candidates.length > 0) out.push({ candidates, kind: 'import', line });
      mergeGroupsFrom(before, line);
      return;
    }
    if (writtenGroup.length === 0 && (suffixedGroup ?? []).length === 0) return;
    out.push({ candidates: [{ kind: 'symbol', symbolKey: written, attribute: { written: writtenGroup, ...(suffixedGroup === undefined ? {} : { suffixed: suffixedGroup }) } }], kind: 'import', line });
  };

  /** Merge every group pushed since `before` into ONE ordered group (first-seen key order), so
   *  several readings of one reference resolve as a single dependency: the first reading that
   *  binds wins, and a present-but-ambiguous reading silences the rest. */
  const mergeGroupsFrom = (before: number, line: number): void => {
    if (out.length <= before + 1) return;
    const merged: TargetHint[] = [];
    const seenK = new Set<string>();
    for (const g of out.splice(before)) {
      for (const c of g.candidates) {
        if (c.kind === 'symbol') {
          if (seenK.has(c.symbolKey)) continue;
          seenK.add(c.symbolKey);
        }
        merged.push(c);
      }
    }
    out.push({ candidates: merged, kind: 'import', line });
  };

  /** The extension-method group for a call `value.Name(…)` at `at`: the extension keys of the enclosing
   *  namespaces innermost first, each followed by the namespaces the plain usings of its declarations
   *  import (one set), then the global namespace, then the namespaces of the compilation unit's and the project's usings as ONE set (2+ owners declaring an
   *  in-scope `Name` → ambiguous → silence). Aliases import no
   *  extension methods. A `using static T;` imports those of the class T, read as the key `T#Name()` the class declares beside the namespace's key, at the level of its directive. */
  const pushExtension = (name: string, enclosingNs: string[], line: number, at: number, unless: CsharpCondition[]): void => {
    const candidates: TargetHint[] = [];
    const pushed = new Set<string>();
    const addSet = (set: SymbolSetMember[]): void => {
      for (const m of set) {
        if (pushed.has(m.symbolKey)) continue;
        pushed.add(m.symbolKey);
        candidates.push({ kind: 'symbol', symbolKey: m.symbolKey, set });
      }
    };
    const levels = levelsAt(enclosingNs, at);
    for (const [i, ns] of enclosingNs.entries()) {
      pushed.add(extensionKey(ns, name));
      candidates.push({ kind: 'symbol', symbolKey: extensionKey(ns, name) });
      const k = levels.findIndex((o) => o.ns === ns);
      if (k >= 0) addSet(levelSet(enclosingNs.slice(i), levels, k, at, (p) => extensionKey(p, name), undefined, [], { key: (t) => classExtensionKey(t, name), nestedOnly: false }));
    }
    // The compilation unit is the last level, and its namespace is the global one: the global namespace's own static classes come before the namespaces its using directives import (C# spec §12.8.10.3, §7.8.1).
    pushed.add(extensionKey('', name));
    candidates.push({ kind: 'symbol', symbolKey: extensionKey('', name) });
    // A namespace both enclosing and imported only repeats a key already read.
    addSet([...usingPrefixes.filter((p) => !enclosingNs.includes(p)).map((p) => ({ symbolKey: extensionKey(p, name) })), ...compilationUnitStatics.map((t) => ({ symbolKey: classExtensionKey(t, name) }))]);
    // Every extension reading carries the conditions under which the call is no extension call at all (`unless`).
    if (unless.length > 0) for (const c of candidates) (c as SymbolHint).unless = unless;
    out.push({ candidates, kind: 'import', line });
  };

  // The two parts the descriptors name by place. An extract a store kept without them (it copied `refs` and the fields it knew) names places that hold nothing: a descriptor that does gives no group, since the condition it carries cannot be read and the edge without it may be the false one.
  const lists = (extract.lists ?? []).map((list) => list.map(typeRef));
  /** The readings of the receiver type at `place` of the extract's `receiverTypes`, built once for every call that names it; undefined where the extract holds nothing at that place. */
  const receiverGroups = new Map<number, TargetHint[]>();
  const receiverReadings = (place: number): TargetHint[] | undefined => {
    let group = receiverGroups.get(place);
    if (group === undefined) {
      const written = extract.receiverTypes?.[place];
      if (written === undefined) return undefined;
      receiverGroups.set(place, (group = groupOf(written)));
    }
    return group;
  };

  /** The ordered group of readings one reference gives, taken aside instead of pushed (empty when it gives none). */
  const groupOf = (r: CsharpRefDescriptor): TargetHint[] => {
    const before = out.length;
    replay(r);
    return out.splice(before)[0]?.candidates ?? [];
  };

  // Replay the descriptors in original emit order (static targets first, then alias-RHS embedded
  // types, then the main walk) — the order is load-bearing for the downstream reason order.
  const replay = (r: CsharpRefDescriptor): void => {
    switch (r.kind) {
      case 'target': {
        // A named type of a using alias or `using static` target, read where the directive reads it (`typeReadings`). A bare `Program` may be the implicit class of top-level statements, as in `pushRef`.
        const candidates: TargetHint[] = typeReadings(r.enclosingNs, r.outer ?? [], r.at, r.fqn);
        if (r.fqn === 'Program') candidates.push({ kind: 'symbol', symbolKey: IMPLICIT_PROGRAM_KEY });
        pushHints(candidates, r.line);
        break;
      }
      case 'plain':
        pushRef(r.ref, r.enclosingNs, r.line, r.rooted, r.at, r.types);
        break;
      case 'alias': {
        // `S::Tail` (B5): rewrite the leftmost alias to its aliased FQN and resolve `N.Tail` from
        // the root (verbatim FQN). Fires ONLY when `S` is a confirmed alias in the MERGED map —
        // an extern/unknown alias (`Lib::A.B`) is dropped (its `::` text cannot collide with a
        // dot-only key → R13 silence-by-luck).
        const view = viewAlias(r.aliasName, r.enclosingNs, r.at);
        if (view !== undefined) pushHints(aliasTargetHints(view, `.${r.tail}`), r.line);
        break;
      }
      case 'attr': {
        if (r.alias === undefined) {
          pushAttribute(r.written, r.suffixed, r.enclosingNs, r.line, r.rooted === true, r.at, r.types);
          break;
        }
        // `[S::Foo]`: both readings in the namespace `S` names, from the root (B5); nothing when `S` is no confirmed alias.
        const view = viewAlias(r.alias, r.enclosingNs, r.at);
        if (view !== undefined) {
          const writtenAll = aliasTargetHints(view, `.${r.written}`);
          const suffixedAll = r.suffixed === undefined ? undefined : aliasTargetHints(view, `.${r.suffixed}`);
          const writtenGroup = beforeFileLocal(writtenAll);
          const suffixedGroup = suffixedAll === undefined ? undefined : beforeFileLocal(suffixedAll);
          pushReadings(r.written, writtenGroup, suffixedGroup, writtenGroup.length < writtenAll.length || (suffixedGroup?.length ?? 0) < (suffixedAll?.length ?? 0), r.line);
        }
        break;
      }
      case 'receiver': {
        // Each dotted prefix of the receiver is one reading, merged into ONE group in the order of the lookup: C# binds the first name at the nearest step that knows it (a type around the receiver, an enclosing namespace, its usings, and so on outward) and reads the next names in what it found, so at each step the prefixes are read shortest first, before any reading of a step farther out. `Data.Row.Parse()` in `namespace App.Web` reads `App.Data.Row` before a class `Data` of the global namespace. A `global::` receiver reads each prefix from the root only, where no alias applies. A first name that is an ambiguous project-wide alias leaves only the nested types of the enclosing types (`pushRef`).
        const rooted = r.rooted === true;
        const members = r.members === undefined ? undefined : lists[r.members];
        if (r.members !== undefined && members === undefined) break;
        const unless: CsharpCondition[] | undefined = members === undefined ? undefined : [{ kind: 'member', types: members, name: r.chain[0] }];
        const readings: Array<{ hint: TargetHint; step: number }> = [];
        for (let i = 1; i <= r.chain.length; i++) {
          const before = out.length;
          const steps: number[] = [];
          pushRef(r.chain.slice(0, i).join('.'), r.enclosingNs, r.line, rooted, r.at, r.types, unless, steps);
          for (const [k, hint] of (out.splice(before)[0]?.candidates ?? []).entries()) readings.push({ hint, step: steps[k] });
        }
        const merged: TargetHint[] = [];
        const seen = new Set<string>();
        // A stable sort: within a step the prefixes keep their order, shortest first.
        for (const { hint } of readings.sort((a, b) => a.step - b.step)) {
          const key = (hint as SymbolHint).symbolKey;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(hint);
        }
        if (merged.length > 0) out.push({ candidates: merged, kind: 'import', line: r.line });
        break;
      }
      case 'ext': {
        // The receiver's written type, where the file gives one, is a condition on every reading of the group: an instance method of that name there takes the call.
        const written = (r.on ?? []).map(receiverReadings);
        const from = r.from === undefined ? [] : lists[r.from];
        const holders = r.member === undefined ? [] : lists[r.member.types];
        if (from === undefined || holders === undefined || written.includes(undefined)) break;
        const receivers = (written as TargetHint[][]).filter((g) => g.length > 0);
        const call = { method: r.name, args: r.args ?? 0, typeArgs: r.typeArgs ?? 0, from };
        const unless: CsharpCondition[] = [];
        // A receiver the file does not declare is a value only as a member of a type around the call.
        if (r.member !== undefined) unless.push({ kind: 'no-member', types: holders, name: r.member.name, ...(r.member.direct ? { call } : {}) });
        if (receivers.length > 0 || r.self !== undefined) unless.push({ kind: 'instance-method', ...call, receivers, ...(r.self === undefined ? {} : { self: typeRef(r.self) }) });
        pushExtension(r.name, r.enclosingNs, r.line, r.at, unless);
        break;
      }
    }
  };
  for (const r of refs) replay(r);

  return out;
}

/** The C# `uses()` — the delegating composition of the pure extract and the live assemble. The
 *  parity invariant `uses(file, opts) === assembleCsharpCandidates(extractCsharpRefs(file), opts)`
 *  holds by construction (this IS that composition). */
function uses(file: ParsedFile, options: CsharpUsesOptions = {}): DetectedDep[] {
  return assembleCsharpCandidates(extractCsharpRefs(file), options);
}

/** The C# `uses` with the optional cross-file global-using scope — called directly by the
 *  pass-level pre-pass (the consumer's relation pass) to inject project-wide `global using` prefixes. The interface
 *  `uses` (1-arg) on `csharpExtractor` delegates here with no options. */
export function csharpUses(file: ParsedFile, options?: CsharpUsesOptions): DetectedDep[] {
  return uses(file, options);
}

export const csharpExtractor: DependencyExtractor = {
  languages: new Set(['csharp']),
  rev: 31,
  declarations,
  uses,
};
