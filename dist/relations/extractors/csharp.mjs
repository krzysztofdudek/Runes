import { walk } from '../../ast/walk.mjs';
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
 *    verbatim/top-level LAST), and emit it as a single `DetectedDep`:
 *      [alias-expansion?]                              ← leftmost segment is a local alias
 *        ++ [enclosing-namespace chain innermost→outermost]
 *        ++ [using-prefix block, code-point sorted]    ← ONE binding level (CS0104 set)
 *        ++ [verbatim / bare top-level]                ← farthest, last
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
/**
 * The file-scoped namespace FQN (`namespace Foo.Bar;`), or '' if the file has none.
 *
 * D6 GOTCHA: a `file_scoped_namespace_declaration` does NOT nest the type declarations
 * as its children — the types are SIBLINGS in the `compilation_unit`. (C# allows at most
 * one file-scoped namespace, and it cannot mix with block namespaces at top level.) So
 * the ancestor walk in `blockNamespace()` cannot see it; it must be read off the
 * compilation unit once and prefixed onto every type's namespace.
 */
function fileScopedNamespace(root) {
    let ns = '';
    walk(root, (node) => {
        if (node.type === 'file_scoped_namespace_declaration') {
            const nameField = node.childForFieldName('name');
            if (nameField !== null && nameField.text !== '')
                ns = nameField.text;
            return false; // at most one; do not descend
        }
        return undefined;
    });
    return ns;
}
/** The dotted BLOCK-namespace prefix for a node, read from its ancestor chain. Nested
 *  `namespace A { namespace B { } }` concatenates outermost-first → "A.B". Empty when no
 *  block namespace ancestor (the type may still sit in a file-scoped namespace). */
function blockNamespace(node) {
    const parts = [];
    let cur = node.parent;
    while (cur !== null) {
        if (cur.type === 'namespace_declaration') {
            const nameField = cur.childForFieldName('name');
            if (nameField !== null && nameField.text !== '')
                parts.unshift(nameField.text);
        }
        cur = cur.parent;
    }
    return parts.join('.');
}
/** The enclosing-TYPE chain of `node`, read from its ancestor chain, outermost-first.
 *  A nested `class Inner` inside `class Outer` yields `["Outer"]`; deeper nesting yields
 *  `["Outer", "Mid"]`. Empty when the type is not nested in another type. Joined with the
 *  type's own simple name by `+` (the .NET reflection FQN separator) — distinct from the
 *  namespace `.` so a nested key lives in a disjoint string space from any dot-only use
 *  candidate (separator isolation). */
function enclosingTypeChain(node) {
    const parts = [];
    let cur = node.parent;
    while (cur !== null) {
        if (TYPE_DECLARATION_TYPES.has(cur.type)) {
            const nameField = cur.childForFieldName('name');
            if (nameField !== null && nameField.text !== '')
                parts.unshift(nameField.text);
        }
        cur = cur.parent;
    }
    return parts;
}
/** True when a `*_declaration` node carries the C#11 `file` modifier — a child `modifier`
 *  node whose text is the keyword `file`. A `file`-modified type is visible ONLY inside its
 *  declaring source file (it cannot be referenced cross-file, and two different files may each
 *  declare an unrelated same-named `file` type). */
function hasFileModifier(node) {
    for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c !== null && c.type === 'modifier' && c.text === 'file')
            return true;
    }
    return false;
}
/** True when `node` is a `file`-local type OR is nested (at any depth) inside a `file`-local
 *  type. A type unreachable across files because an enclosing type is `file`-local must also be
 *  withheld from the cross-file index — a nested type of a `file` type cannot escape the file. */
function isFileLocalType(node) {
    let cur = node;
    while (cur !== null) {
        if (TYPE_DECLARATION_TYPES.has(cur.type) && hasFileModifier(cur))
            return true;
        cur = cur.parent;
    }
    return false;
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
function extensionKey(ns, name) {
    return ns === '' ? `${name}()` : `${ns}.${name}()`;
}
/**
 * The symbol key of the class the compiler synthesizes for a file of top-level statements. That class is the global `Program`, but it is published under this separate key so that it only ever acts as a FALLBACK: a bare `Program` reference tries every explicit reading first (the enclosing namespaces, the usings, and the verbatim global `Program`, which a `public partial class Program { }` declares) and reaches this key last. An explicit global `Program` anywhere therefore binds before any implicit one, and only when none is declared do the implicit classes count (one owner gives the edge, several give silence). A resolver given the reference graph (`ResolverDeps.reach`) reads the explicit and the implicit class as ONE name instead, as the compiler does, and chooses among those the referencing project can see, as long as the graph can say something about each of them. `<Program>$` is the name the compiler gave the class before C# 10; no C# source can write it, so no type key or use candidate other than that fallback can ever produce it.
 */
export const IMPLICIT_PROGRAM_KEY = '<Program>$';
/** The first top-level statement of a C# file (a `global_statement` child of the compilation unit), or undefined when the file has none. */
function firstTopLevelStatement(root) {
    return root.namedChildren.find((c) => c?.type === 'global_statement');
}
/** True when `node` has a `static` modifier child. */
function hasStaticModifier(node) {
    for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c !== null && c.type === 'modifier' && c.text === 'static')
            return true;
    }
    return false;
}
/** True when a parameter carries the `this` modifier (the receiver of a classic extension method). */
function isThisParameter(param) {
    for (let i = 0; i < param.childCount; i++) {
        const c = param.child(i);
        if (c !== null && c.type === 'modifier' && c.text === 'this')
            return true;
    }
    return false;
}
/** The enclosing type declaration of `node` (its nearest TYPE ancestor), or null. */
function enclosingTypeDecl(node) {
    let cur = node.parent;
    while (cur !== null) {
        if (TYPE_DECLARATION_TYPES.has(cur.type))
            return cur;
        cur = cur.parent;
    }
    return null;
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
 * True when the bare name `name`, written at `node`, names a type parameter in scope there. C# looks a simple name without type arguments up among the type parameters of the enclosing generic declarations before any member, namespace or using (§7.6.1), so inside `class Repository<Entity>` or `T Resolve<T>()` such a name is never a type of the repository, whatever an imported namespace declares. A type parameter's scope is its whole declaration except the declaration's own attributes (`[A(typeof(T))] class C<T>` names an outer `T`). A name with type arguments (`Entity<int>`) never names a type parameter, so only bare names are asked about; a qualified name cannot start with a type parameter in valid C# (CS0704), and a member access through one (`T.Create()`) is no receiver because the receiver reading asks this function too.
 */
function isTypeParameterInScope(name, node) {
    let child = node;
    for (let cur = node.parent; cur !== null; child = cur, cur = cur.parent) {
        if (!TYPE_PARAMETER_OWNERS.has(cur.type) || child.type === 'attribute_list')
            continue;
        const list = cur.namedChildren.find((c) => c.type === 'type_parameter_list');
        if (list !== undefined && list.namedChildren.some((p) => p.childForFieldName('name').text === name))
            return true;
    }
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
function extensionMethodName(node) {
    if (node.type !== 'method_declaration' && node.type !== 'local_function_statement')
        return undefined;
    const owner = enclosingTypeDecl(node);
    if (owner?.type !== 'class_declaration' || !hasStaticModifier(owner) || isFileLocalType(owner) || enclosingTypeDecl(owner) !== null) {
        return undefined;
    }
    const name = node.childForFieldName('name').text; // a method / local function always has a name
    if (node.type === 'local_function_statement') {
        // Only a local function DIRECTLY in the body of the misread `extension(…)` constructor of the
        // static class itself; a local function anywhere else is a helper, never an extension member.
        const ctor = node.parent.parent;
        const misreadBlock = ctor.type === 'constructor_declaration' && ctor.childForFieldName('name').text === 'extension' && ctor.parent.parent.id === owner.id;
        return misreadBlock ? name : undefined;
    }
    // The C# 14 block form on a grammar that knows it: a method inside an extension declaration.
    for (let cur = node.parent; cur.id !== owner.id; cur = cur.parent) {
        if (cur.type === 'extension_declaration')
            return name;
    }
    // The classic form: the first parameter carries `this`.
    const first = node.childForFieldName('parameters').namedChild(0);
    return first?.type === 'parameter' && isThisParameter(first) ? name : undefined;
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
function declarations(file) {
    const out = [];
    const fileNs = fileScopedNamespace(file.tree.rootNode);
    walk(file.tree.rootNode, (node) => {
        const extName = extensionMethodName(node);
        if (extName !== undefined) {
            const ns = [fileNs, blockNamespace(node)].filter((p) => p !== '').join('.');
            out.push({ symbolKey: extensionKey(ns, extName), line: node.startPosition.row + 1 });
            return undefined;
        }
        if (!TYPE_DECLARATION_TYPES.has(node.type))
            return undefined;
        const nameField = node.childForFieldName('name');
        if (nameField === null || nameField.text === '')
            return undefined;
        // C#11 `file`-local type → not a cross-file resolution target. Skip publishing its FQN.
        if (isFileLocalType(node))
            return undefined;
        const blockNs = blockNamespace(node);
        const ns = [fileNs, blockNs].filter((p) => p !== '').join('.');
        const typeKey = [...enclosingTypeChain(node), nameField.text].join('+');
        const symbolKey = ns === '' ? typeKey : `${ns}.${typeKey}`;
        out.push({ symbolKey, line: node.startPosition.row + 1 });
        return undefined;
    });
    // Top-level statements compile into a class named `Program` in the global namespace, which the source never declares; `WebApplicationFactory<Program>` names it. Publish it at the first statement under the fallback key (see IMPLICIT_PROGRAM_KEY), unless the file declares a global `Program` itself (`public partial class Program { }`), whose own key already covers it.
    const firstStatement = firstTopLevelStatement(file.tree.rootNode);
    if (firstStatement && !out.some((d) => d.symbolKey === 'Program')) {
        out.push({ symbolKey: IMPLICIT_PROGRAM_KEY, line: firstStatement.startPosition.row + 1 });
    }
    return out;
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
function directiveNamespaceText(directive, skipName = null) {
    for (let i = 0; i < directive.namedChildCount; i++) {
        const c = directive.namedChild(i);
        if (c === null)
            continue;
        if (skipName !== null && c.id === skipName.id)
            continue;
        if (NAMESPACE_NODE_TYPES.has(c.type))
            return stripGlobalQualifier(c.text);
    }
    return undefined;
}
/**
 * True when a `declaration_expression` sits where C# lets one declare a variable: as an `out` argument (`F(out T x)`), or as an element, at any tuple depth, of the target of a deconstruction (`(T a, U b) = …`, `foreach ((T a, U b) in …)`). The grammar also reads a comparison pair in an argument list, `F(i < A, j > B)` or `F(x.i < A, j > B)`, as a declaration of a variable `B` of the generic type `i<A, j>` or `x.i<A, j>`; that reading sits in a plain argument and is rejected here, and so is a declaration-shaped element of a tuple that is not a deconstruction target.
 */
function declaresVariable(decl) {
    const arg = decl.parent; // a declaration expression is always an argument's child
    if (hasTokenChild(arg, 'out'))
        return true;
    let tuple = arg.parent;
    while (tuple.type === 'tuple_expression' && tuple.parent.type === 'argument' && tuple.parent.parent.type === 'tuple_expression') {
        tuple = tuple.parent.parent;
    }
    if (tuple.type !== 'tuple_expression')
        return false;
    const target = tuple.parent;
    return (target.type === 'assignment_expression' || target.type === 'foreach_statement') && target.childForFieldName('left')?.id === tuple.id;
}
/** True when the directive has an anonymous token child of the given keyword type. */
function hasTokenChild(directive, token) {
    for (let i = 0; i < directive.childCount; i++) {
        const c = directive.child(i);
        if (c !== null && !c.isNamed && c.type === token)
            return true;
    }
    return false;
}
/** The dotted text of a chain of plain identifiers (`Shop.Core.Customer`, a member access or a qualified name), or undefined for any other expression. */
function dottedName(node) {
    if (node.type === 'identifier')
        return node.text;
    if (node.type !== 'member_access_expression' && node.type !== 'qualified_name')
        return undefined;
    const head = dottedName(node.childForFieldName(node.type === 'qualified_name' ? 'qualifier' : 'expression'));
    const tail = node.childForFieldName('name');
    return head !== undefined && tail.type === 'identifier' ? `${head}.${tail.text}` : undefined;
}
/** Strip a leading `global::` alias qualifier (R12): `global::A.B.Base` → `A.B.Base`, resolved
 *  as a fully-qualified name from the root. A NON-`global` extern/using alias qualifier
 *  (`Lib::A.B`) is left intact — its `::` text never matches a dot-only declaration key, so it
 *  stays silence-by-luck (R13), never mis-binding a same-tail type. */
function stripGlobalQualifier(text) {
    return text.startsWith('global::') ? text.slice('global::'.length) : text;
}
/** `A.B<C<D>>.E` → `A.B.E`: drop every (nested) type-argument list from a written type name. */
function stripTypeArguments(text) {
    let depth = 0;
    let out = '';
    for (const ch of text) {
        if (ch === '<')
            depth++;
        else if (ch === '>')
            depth = Math.max(0, depth - 1);
        else if (depth === 0)
            out += ch;
    }
    return out;
}
/** Build the file's using scope: file-local plain prefixes, project-wide `global using`
 *  prefixes, the alias map (file-local + project-wide global aliases tracked apart), and the
 *  fully-resolved target type of each `using static` / `global using static` directive. */
function buildUsingScope(file) {
    const prefixes = [];
    const globalPrefixes = [];
    const aliases = new Map();
    const globalAliases = new Map();
    const aliasDecls = new Map();
    const staticTargets = [];
    walk(file.tree.rootNode, (node) => {
        if (node.type !== 'using_directive')
            return undefined;
        // `using static N.C;` imports a type's static MEMBERS, not a namespace → NO namespace
        // prefix. But the TARGET type `N.C` IS a real type dependency of this file (A8/A11),
        // resolved like an alias RHS (already fully-qualified). Record it as a static target.
        if (hasTokenChild(node, 'static')) {
            const target = directiveNamespaceText(node);
            if (target !== undefined && target !== '') {
                staticTargets.push({ fqn: target, line: node.startPosition.row + 1 });
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
            const fqn = written === undefined ? undefined : stripTypeArguments(written);
            if (fqn !== undefined && fqn !== '') {
                aliases.set(aliasName.text, fqn);
                const targetNode = node.namedChildren.find((c) => c !== null && c.id !== aliasName.id);
                const decls = aliasDecls.get(aliasName.text) ?? [];
                const block = directiveBlock(file, node);
                decls.push({ fqn, body: directiveBodyChain(file, node), rooted: targetNode?.text.startsWith('global::') === true, outer: outerUsings(file, node), start: block.start, end: block.end });
                aliasDecls.set(aliasName.text, decls);
                if (hasTokenChild(node, 'global'))
                    globalAliases.set(aliasName.text, fqn);
            }
            return undefined;
        }
        // Plain `using Foo.Bar;` or `global using Foo.Bar;` — a namespace import. Either binds
        // for THIS file; a `global using` is ALSO recorded apart so the consumer's relation pass can apply it
        // project-wide to every C# file.
        const ns = directiveNamespaceText(node);
        if (ns !== undefined && ns !== '') {
            if (hasTokenChild(node, 'global'))
                globalPrefixes.push(ns);
            else
                prefixes.push(ns);
        }
        return undefined;
    });
    return { prefixes, globalPrefixes, aliases, globalAliases, aliasDecls, staticTargets };
}
/** The enclosing-namespace chain of a using directive, innermost first: the namespace body that holds it. A directive above a file-scoped `namespace X;` sits in the compilation unit (empty chain), one below it in the namespace body. */
/** The text range of the block that holds a using directive: the namespace declaration around it, or from a file-scoped `namespace X;` to the end of the file when the directive sits below one, or the whole file when it sits in the compilation unit. An alias reaches the uses inside that range and no other. */
function directiveBlock(file, directive) {
    for (let cur = directive.parent; cur !== null; cur = cur.parent) {
        if (cur.type === 'namespace_declaration')
            return { start: cur.startIndex, end: cur.endIndex };
    }
    const root = file.tree.rootNode;
    const scoped = root.namedChildren.find((c) => c !== null && c.type === 'file_scoped_namespace_declaration');
    if (scoped !== undefined && scoped !== null && directive.startIndex > scoped.startIndex)
        return { start: scoped.startIndex, end: root.endIndex };
    return { start: 0, end: root.endIndex };
}
/** The using directives of every namespace declaration around the body that holds `directive`, innermost first, the declarations without any left out: in C# they take part in the lookup of the directive's target at their own namespace (spec §7.8.1), while those of the body that holds the directive do not (§14.5.2). The compilation unit's own usings are not listed (a deliberate silence: C# reads them only after the global namespace). */
function outerUsings(file, directive) {
    const out = [];
    let ownBlockSeen = false;
    for (let cur = directive.parent; cur !== null; cur = cur.parent) {
        if (cur.type !== 'namespace_declaration')
            continue;
        if (!ownBlockSeen) {
            ownBlockSeen = true;
            continue;
        }
        const prefixes = [];
        const aliases = [];
        for (const d of cur.childForFieldName('body').namedChildren) {
            if (d.type !== 'using_directive' || hasTokenChild(d, 'static'))
                continue;
            const aliasName = d.childForFieldName('name');
            if (aliasName !== null)
                aliases.push(aliasName.text);
            else {
                const ns = directiveNamespaceText(d);
                if (ns !== undefined && ns !== '')
                    prefixes.push(ns);
            }
        }
        // The namespace the declaration stands for, spelled as the levels of the lookup are (`directiveBodyChain`): the chain of a node directly in its body, innermost first.
        if (prefixes.length === 0 && aliases.length === 0)
            continue;
        for (const ns of directiveBodyChain(file, cur.childForFieldName('body')).slice(0, 1))
            out.push({ ns, prefixes, aliases });
    }
    return out;
}
function directiveBodyChain(file, node) {
    const scoped = file.tree.rootNode.namedChildren.find((c) => c !== null && c.type === 'file_scoped_namespace_declaration');
    const below = scoped !== undefined && scoped !== null && node.startIndex > scoped.startIndex;
    return enclosingNamespaceChain(below ? fileScopedNamespace(file.tree.rootNode) : '', node);
}
/**
 * Collect the `global using Foo.Bar;` namespace prefixes a C# file declares (project-wide
 * imports). Used by the cross-file pre-pass in the consumer's relation pass to aggregate the global usings of every
 * file of a project before per-file resolution, so a `global using` in ANY file of the project
 * qualifies bare names in EVERY file of that project (R5, M6). Aliases and `using static` are file-local (per the C# spec, a `global using static`
 * / `global using alias` is still project-wide, but its members/alias are not a namespace
 * prefix), so only the namespace-import global prefixes are aggregated here.
 */
export function collectGlobalUsings(file) {
    return buildUsingScope(file).globalPrefixes;
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
export function collectGlobalUsingAliases(file) {
    return [...buildUsingScope(file).globalAliases.entries()];
}
/** The enclosing-namespace prefixes for a reference, INNERMOST first. For a reference in
 *  `namespace App.Services.Sub` (file-scoped `App` + block chain `Services.Sub`) the chain
 *  is `["App.Services.Sub", "App.Services", "App"]` — C# looks an unqualified/partial name
 *  up against each progressively-shorter enclosing namespace, innermost outward, before the
 *  imports. An empty result means the reference sits at true file scope. */
function enclosingNamespaceChain(fileNs, node) {
    const segments = [fileNs, blockNamespace(node)]
        .filter((p) => p !== '')
        .join('.')
        .split('.')
        .filter((s) => s !== '');
    const chain = [];
    for (let i = segments.length; i >= 1; i--)
        chain.push(segments.slice(0, i).join('.'));
    return chain;
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
function collectDeclaredNames(root) {
    const declaredNames = new Set();
    const methodNames = new Set();
    walk(root, (node) => {
        if (node.type === 'implicit_parameter' || node.type === 'single_variable_designation') {
            declaredNames.add(node.text);
        }
        else if (node.type === 'foreach_statement') {
            const left = node.childForFieldName('left');
            if (left.type === 'identifier')
                declaredNames.add(left.text); // `foreach (var (a, b) in …)` is a pattern
        }
        else if (NAME_DECLARING_TYPES.has(node.type)) {
            // An ordinary (non-extension) method or local function also names a callable member.
            const ordinaryMethod = (node.type === 'method_declaration' || node.type === 'local_function_statement') && extensionMethodName(node) === undefined;
            for (let i = 0; i < node.childCount; i++) {
                if (node.fieldNameForChild(i) !== 'name' || node.child(i).type !== 'identifier')
                    continue;
                declaredNames.add(node.child(i).text);
                if (ordinaryMethod)
                    methodNames.add(node.child(i).text);
            }
        }
        return undefined;
    });
    return { declaredNames, methodNames };
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
export function extractCsharpRefs(file) {
    const scope = buildUsingScope(file);
    const fileNs = fileScopedNamespace(file.tree.rootNode);
    const refs = [];
    // A node id is recorded here once its TYPE reference has been emitted, so a later, broader
    // walk visit (e.g. the generic outermost-qualified_name pass) never re-emits the same node.
    const emitted = new Set();
    // Every value/member name this file declares (M16 shadow guard) and the names of the ordinary
    // (non-extension) methods it declares (m27 guard). See `collectDeclaredNames`.
    const { declaredNames, methodNames } = collectDeclaredNames(file.tree.rootNode);
    /** True when `node` sits inside a `nameof(…)` operand — a string producer, never a dependency. */
    const insideNameof = (node) => {
        for (let cur = node.parent; cur !== null; cur = cur.parent) {
            if (cur.type === 'invocation_expression' && cur.childForFieldName('function')?.text === 'nameof')
                return true;
        }
        return false;
    };
    /** True when a call's receiver is a VALUE rather than a type name: its leftmost element is a
     *  name this file declares, `this`, or any non-name expression (a call result, `new`, a literal,
     *  an index…). An undeclared leftmost identifier reads as a type (a static call, handled as a
     *  `receiver`); `base.X()` and a predefined/generic/qualified type receiver are never instances. */
    const instanceLikeReceiver = (receiver) => {
        let cur = receiver;
        while (cur.type === 'member_access_expression')
            cur = cur.childForFieldName('expression');
        if (cur.type === 'identifier')
            return declaredNames.has(cur.text);
        return !NON_INSTANCE_RECEIVERS.has(cur.type);
    };
    /** The method name of an extension-method-shaped call `value.Name(…)` / `value?.Name(…)`, or
     *  undefined when the call cannot be an in-repo extension-method call worth resolving. */
    const extensionCall = (inv) => {
        const fn = inv.childForFieldName('function');
        let nameNode;
        let receiver;
        if (fn.type === 'member_access_expression') {
            nameNode = fn.childForFieldName('name');
            receiver = fn.childForFieldName('expression');
        }
        else if (fn.type === 'conditional_access_expression') {
            // `value?.Name(…)`; a binding holding an ERROR is a parser recovery, never read as a call.
            const binding = findChild(fn, 'member_binding_expression');
            if (binding === null || findChild(binding, 'ERROR') !== null)
                return undefined;
            nameNode = binding.childForFieldName('name');
            receiver = fn.childForFieldName('condition');
        }
        else {
            return undefined;
        }
        // `value.Name<T>(…)` names the method by the generic's base identifier.
        const name = (nameNode.type === 'generic_name' ? findChild(nameNode, 'identifier') : nameNode).text;
        if (OBJECT_MEMBER_NAMES.has(name) || methodNames.has(name))
            return undefined;
        return instanceLikeReceiver(receiver) ? name : undefined;
    };
    // In a file of top-level statements, a bare `Program` (and `Program.X`) names that file's own implicit class: C# finds it in the global namespace before any using or any other project's type, so such a reference binds nothing else and is not emitted. A reference from inside a namespace block of the same file, where a nearer `Ns.Program` could win, is dropped too (silence, never a wrong edge).
    const ownsProgram = firstTopLevelStatement(file.tree.rootNode) !== undefined;
    const namesOwnProgram = (ref) => ownsProgram && (ref === 'Program' || ref.startsWith('Program.'));
    /** Emit a plain reference descriptor (alias-unresolved). `enclosingNs` is precomputed from the
     *  node before the tree is destroyed; the alias/using expansion happens later, on assembly. */
    const pushRef = (ref, node, line, rooted = false) => {
        if (namesOwnProgram(ref))
            return;
        refs.push({
            kind: 'plain',
            ref,
            line,
            rooted,
            enclosingNs: enclosingNamespaceChain(fileNs, node),
            at: node.startIndex,
        });
    };
    /** Emit an attribute descriptor (the two-reading `[Foo]`/`[FooAttribute]` group). */
    const pushAttribute = (written, suffixed, node, line, rooted = false, alias) => {
        refs.push({
            kind: 'attr',
            written,
            suffixed,
            line,
            enclosingNs: enclosingNamespaceChain(fileNs, node),
            at: node.startIndex,
            rooted,
            ...(alias !== undefined ? { alias } : {}),
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
    const emitTypeNode = (typeNode) => {
        if (typeNode === null)
            return;
        switch (typeNode.type) {
            case 'identifier': {
                if (emitted.has(typeNode.id))
                    return;
                emitted.add(typeNode.id);
                if (isTypeParameterInScope(typeNode.text, typeNode))
                    return; // `T x;`, `GetRequiredService<T>()` inside `M<T>()` name the type parameter
                pushRef(typeNode.text, typeNode, typeNode.startPosition.row + 1);
                return;
            }
            case 'qualified_name': {
                if (emitted.has(typeNode.id))
                    return;
                emitted.add(typeNode.id);
                emitQualified(typeNode);
                return;
            }
            case 'alias_qualified_name': {
                // `global::A.B` rooted reference (R12): resolve the right side from the global root.
                const aliasField = typeNode.childForFieldName('alias');
                if (aliasField !== null && aliasField.text === 'global') {
                    if (emitted.has(typeNode.id))
                        return;
                    emitted.add(typeNode.id);
                    // `global::Settings` / `global::Box<T>`: the one name is looked up in the global namespace only, never in an enclosing namespace or a using, and no type parameter shadows it, so it is a rooted reference; the type arguments are ordinary references.
                    const nameField = typeNode.childForFieldName('name'); // an alias-qualified name always has its name
                    const generic = nameField.type === 'generic_name';
                    pushRef((generic ? findChild(nameField, 'identifier') : nameField).text, typeNode, typeNode.startPosition.row + 1, true);
                    if (generic)
                        emitTypeArguments(nameField);
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
                            tail: stripTypeArguments(generic !== null ? findChild(generic, 'identifier').text : stripGlobalQualifier(nameField.text)),
                            line: typeNode.startPosition.row + 1,
                            enclosingNs: enclosingNamespaceChain(fileNs, typeNode),
                            at: typeNode.startIndex,
                        });
                        if (generic !== null)
                            emitTypeArguments(generic);
                    }
                }
                return;
            }
            case 'generic_name': {
                // The generic's BASE name is a type reference of its own (`Repository<Order>` depends on
                // `Repository` as much as on `Order`), resolved like a bare identifier. An external
                // container (`List`, `Task`, `Dictionary`) resolves to no in-repository declaration, so it stays
                // silent by the ordinary fail-to-silence rule. The type arguments are descended as before.
                if (emitted.has(typeNode.id))
                    return;
                emitted.add(typeNode.id);
                pushRef(findChild(typeNode, 'identifier').text, typeNode, typeNode.startPosition.row + 1);
                emitTypeArguments(typeNode);
                return;
            }
            case 'array_type':
            case 'nullable_type':
            case 'pointer_type': {
                emitTypeNode(typeNode.childForFieldName('type'));
                return;
            }
            case 'tuple_type': {
                for (let i = 0; i < typeNode.namedChildCount; i++) {
                    const el = typeNode.namedChild(i);
                    if (el !== null && el.type === 'tuple_element')
                        emitTypeNode(el.childForFieldName('type'));
                }
                return;
            }
            default:
                // predefined_type / implicit_type / function_pointer_type / unrecognized → no named dep.
                return;
        }
    };
    /** Descend the type arguments of one `generic_name` (each argument is its own reference). */
    function emitTypeArguments(generic) {
        const args = findChild(generic, 'type_argument_list'); // a generic_name always has its argument list
        for (let i = 0; i < args.namedChildCount; i++)
            emitTypeNode(args.namedChild(i));
    }
    /**
     * Emit one `qualified_name` reference. A qualified name that carries generic segments
     * (`Shop.Core.Repository<int>`, `Outer<int>.Inner`) is referenced by its PLAIN dotted name — the
     * type-argument lists stripped (`Shop.Core.Repository`, `Outer.Inner`), because declaration keys
     * carry no arity — and every type-argument list inside it is descended as its own references.
     * Without the strip the written text, `<…>` included, could never match a declaration key.
     */
    function emitQualified(q) {
        const line = q.startPosition.row + 1;
        const rooted = q.text.startsWith('global::');
        const parts = qualifiedNameParts(q);
        if (parts.alias !== undefined) {
            // `S::Core.Order` (188): the leftmost `S` is a using alias, rewritten on assembly to the namespace it names; an alias the map does not bind (an extern alias, `Lib::A.B`) is dropped there (R13).
            refs.push({ kind: 'alias', aliasName: parts.alias, tail: parts.name, line, enclosingNs: enclosingNamespaceChain(fileNs, q), at: q.startIndex });
        }
        else {
            pushRef(parts.name, q, line, rooted);
        }
        for (const g of parts.generics)
            emitTypeArguments(g);
    }
    /**
     * Emit the type a member-access EXPRESSION spells where only a type can stand (`Shop.Core.Customer`, `global::Shop.Customer`, `Shop.Core.Repo<int>`, `Outer<int>.Inner`: the grammar's reading of an unnamed tuple element beside a named one). The reference is the plain dotted name with every type-argument list stripped, rooted when it starts with `global::`, and each type-argument list is descended as references of its own. A chain that starts with a type parameter in scope (invalid C#, CS0704) emits nothing, and so does a chain through a using alias (`S::A.B`: a member access cannot spell one, and the qualified-name form rewrites it on assembly) or any other shape.
     */
    function emitMemberAccessType(access) {
        const segs = [];
        const generics = [];
        let rooted = false;
        const collect = (n) => {
            switch (n.type) {
                case 'identifier':
                    segs.push(n.text);
                    return true;
                case 'generic_name':
                    segs.push(findChild(n, 'identifier').text);
                    generics.push(n);
                    return true;
                case 'member_access_expression':
                    return collect(n.childForFieldName('expression')) && collect(n.childForFieldName('name'));
                case 'alias_qualified_name':
                    rooted = n.childForFieldName('alias').text === 'global';
                    return rooted && collect(n.childForFieldName('name'));
                default:
                    return false;
            }
        };
        if (!collect(access) || (!rooted && isTypeParameterInScope(segs[0], access)))
            return;
        pushRef(segs.join('.'), access, access.startPosition.row + 1, rooted);
        for (const g of generics)
            emitTypeArguments(g);
    }
    /** A qualified name's plain dotted name, its type-argument lists stripped (`Shop.Core.Repository<int>` → `Shop.Core.Repository`, because declaration keys carry no arity), the using alias that leads it (`S::Core.Order` → `S`, with the tail `Core.Order`; a `global::` qualifier is not an alias and is stripped), and its generic segments, whose type arguments are references of their own. */
    function qualifiedNameParts(q) {
        const segs = [];
        const generics = [];
        let alias;
        const collect = (n) => {
            if (n.type === 'qualified_name') {
                collect(n.childForFieldName('qualifier'));
                collect(n.childForFieldName('name'));
            }
            else if (n.type === 'generic_name') {
                segs.push(findChild(n, 'identifier').text);
                generics.push(n);
            }
            else if (n.type === 'alias_qualified_name') {
                // `global::A.B<T>` resolves from the root (R12); any other alias qualifier is the using alias the tail follows.
                const aliasText = n.childForFieldName('alias').text;
                if (aliasText !== 'global')
                    alias = aliasText;
                collect(n.childForFieldName('name'));
            }
            else {
                segs.push(n.text); // identifier
            }
        };
        collect(q);
        return { name: segs.join('.'), alias, generics };
    }
    /** The first child of the given type, or null. */
    function findChild(node, childType) {
        for (let i = 0; i < node.namedChildCount; i++) {
            const c = node.namedChild(i);
            if (c !== null && c.type === childType)
                return c;
        }
        return null;
    }
    /** Emit one named type written in a using directive's target as the directive reads it (a `target` descriptor): in the namespace body that holds the directive, nearest namespace first, no using directive or alias of that body taking part. A bare `Program` in a file of top-level statements names that file's own class and is not emitted, as in `pushRef`. */
    const pushTarget = (name, directive, line, nearest = false) => {
        if (namesOwnProgram(name))
            return;
        const outer = outerUsings(file, directive);
        refs.push({ kind: 'target', fqn: name, line, enclosingNs: directiveBodyChain(file, directive), ...(nearest ? { nearest } : {}), ...(outer.length > 0 ? { outer } : {}) });
    };
    /**
     * Emit every named type of a type written in a using directive's target, each read where the directive reads its target (C# spec §14.5.2): a bare, qualified or generic name is one `target` reference, a generic's type arguments are references of their own read the same way, and an array, pointer or nullable type and each tuple element are descended to their named types (C# 12 lets an alias name any type; the tuple element labels are not types). A name written after `global::` is rooted. A name written after a using alias (`S::A.B`) gives nothing: an alias of the same body never applies to a directive, and an alias of an outer body or an extern alias is not read (a silence); its type arguments still give theirs.
     */
    function emitDirectiveType(typeNode, directive) {
        const line = typeNode.startPosition.row + 1;
        switch (typeNode.type) {
            case 'identifier':
                pushTarget(typeNode.text, directive, line);
                return;
            case 'generic_name':
                pushTarget(findChild(typeNode, 'identifier').text, directive, line);
                emitDirectiveArguments(typeNode, directive);
                return;
            case 'qualified_name':
            case 'alias_qualified_name': {
                const parts = qualifiedNameParts(typeNode);
                if (parts.alias === undefined) {
                    if (typeNode.text.startsWith('global::'))
                        pushRef(parts.name, typeNode, line, true);
                    else
                        pushTarget(parts.name, directive, line);
                }
                for (const g of parts.generics)
                    emitDirectiveArguments(g, directive);
                return;
            }
            case 'array_type':
            case 'nullable_type':
            case 'pointer_type':
                emitDirectiveType(typeNode.childForFieldName('type'), directive);
                return;
            case 'tuple_type':
                for (const el of typeNode.namedChildren) {
                    if (el.type === 'tuple_element')
                        emitDirectiveType(el.childForFieldName('type'), directive);
                }
                return;
            default:
                // predefined_type / function_pointer_type / unrecognized → no named type.
                return;
        }
    }
    /** The type arguments of one `generic_name` in a directive's target, each read as the directive reads its target. */
    function emitDirectiveArguments(generic, directive) {
        for (const arg of findChild(generic, 'type_argument_list').namedChildren)
            emitDirectiveType(arg, directive);
    }
    // ── `using static N.C;` / `global using static N.C;` TARGET edge (A8/A11) ────────────────
    // The directive imports the static MEMBERS of the concrete type `N.C`; the type itself is a real dependency of this file (never a namespace prefix: a sibling `N.Baz` is never imported). C# resolves it as a using alias target (spec §14.5.4, §14.5.2), so it is read where the directive stands: a directive below `namespace App;` or inside a namespace block reads `App.N.C` before `N.C`, one in the compilation unit reads from the global namespace, and no using directive beside it takes part. A generic type (`using static Repo<Order>;`) gives the edge to `Repo` and to each type argument. Emitted FIRST so the descriptor order, and thus the final edge order, is kept.
    walk(file.tree.rootNode, (node) => {
        if (node.type !== 'using_directive')
            return undefined;
        if (!hasTokenChild(node, 'static'))
            return false;
        const target = node.namedChildren.find((c) => c !== null && NAMESPACE_NODE_TYPES.has(c.type));
        if (target !== undefined && target !== null)
            emitDirectiveType(target, node);
        return false;
    });
    // ── The using alias target and the named types embedded in it (R7 + A6) ─────────────────
    // The alias TARGET: `using F = A.B.Foo;` gives the edge to its type whether or not any line uses F, as `using static` does. A generic target (`using R = A.Repo<Order>;`) gives the edge to its container, the type arguments stripped as the alias map strips them, and each type argument gives its own; C# 12 lets the target be any type (a tuple `(int, Mod.Customer)`, an array `Mod.Order[]`, a pointer, a nullable value), and each named type embedded in it is a reference. Every one of them is read where the directive reads its target (`emitDirectiveType`): a directive below `namespace App;` or inside a namespace block reads `App.Repo` before `Repo`, one in the compilation unit reads from the global namespace, and no using directive beside it takes part; a plain target is read more narrowly, below.
    walk(file.tree.rootNode, (node) => {
        if (node.type !== 'using_directive')
            return undefined;
        const aliasName = node.childForFieldName('name');
        if (aliasName === null)
            return false; // not an alias directive
        const target = node.namedChildren.find((c) => c !== null && c.id !== aliasName.id);
        if (target === undefined || target === null)
            return false;
        // A plain name (`using M = Models;`, `using F = A.B.Foo;`) may name a namespace as much as a type, and a nearer namespace of that name, which no type key shows, decides before any farther type (`namespace App; using M = Models;` with a namespace `App.Models` and a global type `Models` names the namespace): inside a namespace body its directive reads only the nearest reading (`nearest`), a deliberate silence for an unused alias to a farther type. A generic name is always a type and is read in full.
        if (target.type === 'identifier' || (target.type === 'qualified_name' && !target.text.includes('<') && !target.text.includes('::'))) {
            pushTarget(qualifiedNameParts(target).name, node, target.startPosition.row + 1, true);
        }
        else {
            emitDirectiveType(target, node);
        }
        return false;
    });
    walk(file.tree.rootNode, (node) => {
        // Do NOT descend into directive/declaration HEADERS — their dotted names are the
        // imported namespace or the declared namespace name, not a symbol USE.
        if (node.type === 'using_directive' || node.type === 'file_scoped_namespace_declaration') {
            return false;
        }
        if (node.type === 'namespace_declaration') {
            const nameField = node.childForFieldName('name');
            if (nameField !== null)
                return undefined; // continue into the body for real uses
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
        if (node.type === 'method_declaration' ||
            node.type === 'property_declaration' ||
            node.type === 'delegate_declaration' ||
            node.type === 'operator_declaration' ||
            node.type === 'indexer_declaration' ||
            node.type === 'conversion_operator_declaration' ||
            node.type === 'event_declaration') {
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
        if (node.type === 'typeof_expression' ||
            node.type === 'sizeof_expression' ||
            node.type === 'default_expression') {
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
            if (expr !== null && (expr.type === 'identifier' || expr.type === 'qualified_name'))
                emitTypeNode(expr);
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
            if (nameField === null || emitted.has(nameField.id))
                return undefined;
            emitted.add(nameField.id);
            // A name written after `global::` (`[global::Foo]`, `[global::A.Foo]`, `[global::Gen<T>]`) is looked up from the global namespace only (R12), never in an enclosing namespace or a using; the right side of `global::` is the attribute's name. After a using alias (`[S::Foo]`, `[S::Gen<T>]`, `using S = N;`) the right side is the attribute's name in the aliased namespace, rewritten on assembly as a type's `S::Tail` is (B5).
            const rooted = nameField.text.startsWith('global::');
            const aliasField = nameField.type === 'alias_qualified_name' ? nameField.childForFieldName('alias') : null;
            const alias = aliasField !== null && aliasField.text !== 'global' ? aliasField.text : undefined;
            const named = nameField.type === 'alias_qualified_name' ? nameField.childForFieldName('name') : nameField;
            // The C# attribute-naming convention: `[Foo]` may name `Foo` OR `FooAttribute`. Emit both readings as ONE group (the verbatim and the `Attribute`-suffixed form), so the dependency resolves whichever the declaring type is named.
            const emitAttribute = (written, at) => {
                const last = written.split('.').pop() ?? written;
                const suffixed = last.endsWith('Attribute') ? undefined : `${written}Attribute`;
                pushAttribute(written, suffixed, at, at.startPosition.row + 1, rooted, alias);
            };
            if (named !== null && named.type === 'identifier')
                emitAttribute(named.text, nameField);
            else if (named !== null && named.type === 'qualified_name' && !named.text.includes('<'))
                emitAttribute(stripGlobalQualifier(named.text), nameField);
            else if (named !== null && named.type === 'qualified_name') {
                // A generic attribute behind a qualifier (`[A.Gen<Order>]`, `[global::A.Gen<Order>]`): the attribute is named by its plain dotted name, the type-argument lists stripped as a qualified type name's are, and each type argument is its own reference. A qualifier through a using alias (`[S::A.Gen<T>]`) is rewritten onto the aliased namespace on assembly, as in a type position (the alias is read from the outer `S::` qualifier above, so `parts.alias` is empty here).
                const parts = qualifiedNameParts(named);
                if (parts.alias === undefined)
                    emitAttribute(parts.name, nameField);
                for (const g of parts.generics)
                    emitTypeArguments(g);
            }
            else if (named !== null && named.type === 'generic_name') {
                // C#11 generic attribute `[Foo<Bar>]`: the attribute NAME is the `generic_name`'s base identifier (`Foo`, with the `Foo`/`FooAttribute` convention), and each type ARGUMENT (`Bar`) is its own real type reference.
                emitAttribute(findChild(named, 'identifier').text, findChild(named, 'identifier')); // a generic_name always has its identifier
                emitTypeArguments(named);
            }
            return undefined;
        }
        // ── Pre-existing reference forms ──────────────────────────────────────────────────────
        // Qualified references anywhere (outermost qualified_name): static-call receivers,
        // remaining type positions not covered above, etc. Skipped when already emitted by a
        // type-position handler, or when it is a namespace-declaration name, or a nested qualifier.
        if (node.type === 'qualified_name') {
            if (emitted.has(node.id))
                return undefined;
            if (node.parent !== null && node.parent.type === 'namespace_declaration') {
                const nm = node.parent.childForFieldName('name');
                if (nm !== null && nm.id === node.id)
                    return undefined;
            }
            if (node.parent !== null && node.parent.type === 'qualified_name')
                return undefined;
            // A `qualified_name` that is itself the `qualifier` of an `alias_qualified_name` is part
            // of a `global::`-rooted name handled at the alias node — skip the bare qualifier.
            if (node.parent !== null && node.parent.type === 'alias_qualified_name')
                return undefined;
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
            const recoveredNew = node.namedChildren.some((c) => c !== null && c.type === 'ERROR' && c.childCount > 0 && c.child(c.childCount - 1)?.type === 'new');
            const nm = node.childForFieldName('name');
            if (recoveredNew && nm !== null)
                emitTypeNode(nm);
            // A null-conditional generic call `sp?.Get<Ctx>()`: the type arguments, never the method name.
            else if (nm?.type === 'generic_name')
                emitTypeArguments(nm);
            return undefined;
        }
        // Member access through a TYPE name (M16): `Guard.NotNull(o)`, `OrderStatus.Paid`,
        // `Shop.Core.Guard.NotNull(o)`. Handled once, at the innermost access (the one whose receiver
        // is the leftmost identifier). A generic receiver `Result<int>.Ok()` is a type position.
        if (node.type === 'member_access_expression') {
            const expr = node.childForFieldName('expression');
            // A receiver written after `global::` (`global::Guard.NotNull(o)`, `global::Shop.Core.Guard.NotNull(o)`) is read from the global namespace only (R12): its name, not the alias-qualified node, leads the chain, and no name this file declares shadows it.
            const rootedName = expr !== null && expr.type === 'alias_qualified_name' && expr.childForFieldName('alias').text === 'global' ? expr.childForFieldName('name') : null;
            if (expr !== null && (expr.type === 'generic_name' || rootedName?.type === 'generic_name')) {
                emitTypeNode(expr);
            }
            else if (expr !== null && (rootedName?.type === 'identifier' || (expr.type === 'identifier' && !declaredNames.has(expr.text) && !isTypeParameterInScope(expr.text, expr))) && !insideNameof(node)) {
                const rooted = rootedName !== null;
                const chain = [(rootedName ?? expr).text];
                let cur = node;
                // Walk outward while this access is itself the receiver of a further access (a member
                // access only ever nests through its `expression`): every name but the outermost accessed
                // member is a receiver segment. A generic segment (`A.B<int>.C`) ends the dotted chain.
                while (cur.parent.type === 'member_access_expression') {
                    const nm = cur.childForFieldName('name');
                    if (nm.type !== 'identifier')
                        break;
                    chain.push(nm.text);
                    cur = cur.parent;
                }
                if (!namesOwnProgram(chain[0]))
                    refs.push({
                        kind: 'receiver',
                        chain,
                        line: expr.startPosition.row + 1,
                        enclosingNs: enclosingNamespaceChain(fileNs, node),
                        at: node.startIndex,
                        rooted,
                    });
            }
            // A generic member `sp.GetRequiredService<Ctx>()`, `Substitute.For<Ctx>()`: its type arguments are type references; the member name itself is a method, never a type.
            const member = node.childForFieldName('name');
            if (member.type === 'generic_name')
                emitTypeArguments(member);
            return undefined;
        }
        // Extension-method call on an instance-like receiver (m27): `builder.Services.AddInfrastructure()`.
        if (node.type === 'invocation_expression') {
            // A generic method called by its simple name, `Resolve<Ctx>()`: the type arguments are type references; the method name is not a type.
            const fn = node.childForFieldName('function');
            if (fn.type === 'generic_name')
                emitTypeArguments(fn);
            const call = extensionCall(node);
            if (call !== undefined && !insideNameof(node)) {
                refs.push({
                    kind: 'ext',
                    name: call,
                    line: node.startPosition.row + 1,
                    enclosingNs: enclosingNamespaceChain(fileNs, node),
                });
            }
            return undefined;
        }
        // Bare type identifiers in base_list entries.
        if (node.type === 'base_list') {
            for (let i = 0; i < node.namedChildCount; i++)
                emitTypeNode(node.namedChild(i));
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
        if (node.type === 'binary_expression' && node.childForFieldName('operator').type === '<') {
            const right = node.childForFieldName('right');
            const shift = right.type === 'binary_expression' && /^>>>?$/.test(right.childForFieldName('operator').type) ? right : undefined;
            const tuple = shift?.childForFieldName('left') ?? right;
            const elements = tuple.type === 'tuple_expression' ? tuple.namedChildren.map((arg) => arg.namedChild(0)) : [];
            if (elements.some((e) => e.type === 'declaration_expression')) {
                for (const e of elements) {
                    if (e.type === 'declaration_expression')
                        emitTypeNode(e.childForFieldName('type'));
                    // An unnamed element beside a named one is a type spelled as the grammar's expression: a bare, generic or `global::` name goes the type way, a dotted one is read as the qualified name it spells (177).
                    else if (e.type === 'identifier' || e.type === 'generic_name' || e.type === 'alias_qualified_name')
                        emitTypeNode(e);
                    else if (e.type === 'member_access_expression')
                        emitMemberAccessType(e);
                }
                let generic = node.childForFieldName('left');
                for (let level = 1; shift !== undefined && level < shift.childForFieldName('operator').type.length; level++) {
                    if (generic.type !== 'binary_expression' || generic.childForFieldName('operator').type !== '<')
                        break;
                    const name = generic.childForFieldName('right');
                    if (name.type === 'identifier')
                        emitTypeNode(name);
                    generic = generic.childForFieldName('left');
                }
            }
            return undefined;
        }
        // A declaration expression `out T x`, or an element of a deconstruction target `(T a, U b) = …`. Anywhere else the node is the grammar's reading of a comparison pair (`F(i < A, j > B)` as a declaration of `i<A, j> B`, `F(x.i < A, j > B)` as one of `x.i<A, j> B`), which names no type: nothing under it is read, or the general qualified-name reading below would still take `x.i` and its "type arguments" for types.
        if (node.type === 'declaration_expression') {
            if (!declaresVariable(node)) {
                // The comparison reading (177): `F(x < Limits.Max, y > z)` is two comparisons, so each type argument that is a member access `Limits.Max` is a receiver of its own, `Limits` being a type unless this file declares it as a value.
                const type = node.childForFieldName('type');
                const args = type?.type === 'generic_name' ? findChild(type, 'type_argument_list') : null;
                for (let i = 0; args !== null && i < args.namedChildCount; i++) {
                    const arg = args.namedChild(i);
                    const qualifier = arg.type === 'qualified_name' ? arg.childForFieldName('qualifier') : null;
                    const chainText = qualifier !== null ? dottedName(qualifier) : undefined;
                    if (chainText === undefined)
                        continue;
                    const head = chainText.split('.')[0];
                    if (declaredNames.has(head) || isTypeParameterInScope(head, qualifier))
                        continue;
                    refs.push({
                        kind: 'receiver',
                        chain: chainText.split('.'),
                        line: arg.startPosition.row + 1,
                        enclosingNs: enclosingNamespaceChain(fileNs, arg),
                        at: arg.startIndex,
                        rooted: false,
                    });
                }
                return false;
            }
            emitTypeNode(node.childForFieldName('type'));
            return undefined;
        }
        return undefined;
    });
    return { fileNs, scope, refs };
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
export function assembleCsharpCandidates(extract, options = {}) {
    const out = [];
    const { scope, refs } = extract;
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
    const projectAliasTargets = new Map();
    for (const [name, fqn] of options.projectGlobalUsingAliases ?? []) {
        let targets = projectAliasTargets.get(name);
        if (!targets) {
            targets = new Set();
            projectAliasTargets.set(name, targets);
        }
        targets.add(fqn);
    }
    const projectAliases = new Map();
    const ambiguousAliases = new Set();
    for (const [name, targets] of projectAliasTargets) {
        if (targets.size === 1)
            projectAliases.set(name, [...targets][0]);
        if (aliases.has(name))
            continue;
        if (targets.size === 1)
            aliases.set(name, [...targets][0]);
        else
            ambiguousAliases.add(name);
    }
    // The using-import binding level (R2/R9: an UNORDERED set at one scope). File-local plain
    // usings + this file's own `global using` + the project-wide aggregated global usings, all
    // at one tier. Sorted by code point so the candidate display order is deterministic and never
    // load-bearing; the CS0104 set rule (≥2 distinct files → silence) is order-independent.
    const usingPrefixes = [
        ...new Set([
            ...scope.prefixes,
            ...scope.globalPrefixes,
            ...(options.projectGlobalUsings ?? []),
        ]),
    ].sort();
    /** The alias `name` as a reference inside `enclosingNs` sees it, or undefined when no alias of that name is in scope there. An alias is in scope only inside the namespace body that holds its directive (the compilation unit holds every body), and where several directives of one name reach the use the nearest body wins; `nearer` are the enclosing namespaces inside that body, `bodyNs` the namespace of the body itself (undefined for the compilation unit). A project-wide `global using` alias sits in the compilation unit and reads its target from the root. */
    const viewAlias = (name, enclosingNs, at) => {
        // A name this file declares as an alias is read from its own directives: the one whose block is the innermost around the use. A block-only alias does not hide a project-wide `global using` alias of the same name, which sits in the compilation unit.
        let best;
        let bestStart = -1;
        for (const d of scope.aliasDecls.get(name) ?? []) {
            if (at < d.start || at >= d.end || d.start < bestStart)
                continue;
            const bodyNs = d.body[0];
            const index = bodyNs === undefined ? enclosingNs.length : enclosingNs.indexOf(bodyNs);
            if (index < 0)
                continue;
            best = { target: d.fqn, chain: d.rooted ? [] : d.body, outer: d.rooted ? [] : d.outer, nearer: enclosingNs.slice(0, index), bodyNs };
            bestStart = d.start;
        }
        if (best !== undefined)
            return best;
        const projectTarget = projectAliases.get(name);
        return projectTarget === undefined ? undefined : { target: projectTarget, chain: [], outer: [], nearer: enclosingNs, bodyNs: undefined };
    };
    /**
     * The readings of a name written in a using directive's target (`target`, plus a dotted `tail` when an alias of it leads a longer name), in C# lookup order (spec §7.8.1, §14.5.2): at each namespace of the directive's body, nearest first, the member of that namespace; then, where a namespace declaration around that body holds using directives (`outer`), an alias of the target's first name ends the readings there (that alias is not read, a silence), or else the types of the namespaces its usings import form one CS0104 set (a dotted name binds only a nested type under them, R4); and the global namespace last. The using directives of the body that holds the directive take no part, and neither do those of the compilation unit (a silence: C# reads them only after the global namespace).
     */
    const directiveReadings = (chain, outer, target, tail) => {
        const name = `${target}${tail}`;
        const lead = target.split('.')[0];
        const hints = [];
        const seen = new Set();
        const add = (hint) => {
            if (seen.has(hint.symbolKey))
                return;
            seen.add(hint.symbolKey);
            hints.push(hint);
        };
        for (const ns of chain) {
            add({ kind: 'symbol', symbolKey: `${ns}.${name}` });
            const level = outer.find((o) => o.ns === ns);
            if (level === undefined)
                continue;
            if (level.aliases.includes(lead))
                return hints;
            const set = level.prefixes.map((p) => ({ symbolKey: `${p}.${name}`, nestedOnly: name.includes('.') }));
            for (const m of set)
                add({ kind: 'symbol', symbolKey: m.symbolKey, nestedOnly: m.nestedOnly, set });
        }
        add({ kind: 'symbol', symbolKey: name });
        return hints;
    };
    /** The readings of an alias target (plus a dotted `tail`): where its directive reads it (`directiveReadings`). */
    const aliasTargetHints = (view, tail) => directiveReadings(view.chain, view.outer, view.target, tail);
    /** Push ONE group of readings in order (an alias rewrite, `S::Tail`): the first that binds wins. */
    const pushHints = (candidates, line) => {
        out.push({ candidates, kind: 'import', line });
    };
    /**
     * Build and push ONE ordered candidate group for a reference whose written text is `ref` (a
     * dotted partial name or a bare identifier) with its precomputed `enclosingNs` chain. Candidate
     * order = C# name-binding order:
     *   [alias-expansion?] ++ [enclosing-ns chain innermost→outermost]
     *                       ++ [using-prefix block, sorted] ++ [verbatim / bare top-level]
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
    const pushRef = (ref, enclosingNs, line, rooted, at) => {
        // A `global::`-rooted reference (R12) is resolved as a fully-qualified name FROM THE ROOT —
        // no alias, no enclosing-namespace, no using-prefix expansion; the verbatim is the sole
        // candidate.
        if (rooted) {
            const candidates = [{ kind: 'symbol', symbolKey: ref }];
            // `global::Program` names the global `Program`, which may be the implicit class of a file of top-level statements (the fallback after an explicit one).
            if (ref === 'Program')
                candidates.push({ kind: 'symbol', symbolKey: IMPLICIT_PROGRAM_KEY });
            out.push({ candidates, kind: 'import', line });
            return;
        }
        const lead = ref.split('.')[0];
        if (ambiguousAliases.has(lead))
            return; // M7: an alias with 2+ project-wide targets → silence
        const multi = ref.includes('.');
        const aliasView = viewAlias(lead, enclosingNs, at);
        const enclosing = enclosingNs.map((ns) => `${ns}.${ref}`);
        // The using-prefix expansions (one CS0104 set). A multi-segment ref under a using prefix is
        // nested-split-only (R4); a single-segment ref binds the verbatim namespace.type.
        const usingMembers = usingPrefixes.map((p) => ({
            symbolKey: `${p}.${ref}`,
            nestedOnly: multi,
        }));
        const candidates = [];
        const pushed = new Set();
        const add = (hint) => {
            if (hint.kind === 'symbol') {
                if (pushed.has(hint.symbolKey))
                    return;
                pushed.add(hint.symbolKey);
            }
            candidates.push(hint);
        };
        if (aliasView !== undefined) {
            // A member of a namespace nearer than the alias's body hides the alias: those readings come first.
            for (const ns of aliasView.nearer)
                add({ kind: 'symbol', symbolKey: `${ns}.${ref}` });
            // The alias rewrites the leftmost segment; the dotted tail follows it. Its target is read where the directive reads it, nearest namespace of the body first (C# spec §14.5.2).
            const tail = ref.slice(lead.length); // leading '.', or '' for a bare ref
            // Co-definition set (R8): a member named like the alias in the SAME body (CS0576) competes with
            // it — 2+ of these resolving = ambiguous → silence. A member of an outer namespace loses to the alias.
            const sameBody = aliasView.bodyNs === undefined ? ref : `${aliasView.bodyNs}.${ref}`;
            for (const hint of aliasTargetHints(aliasView, tail)) {
                // A reading through an outer using is already a CS0104 set; the same-body member joins it.
                const own = hint.set ?? [{ symbolKey: hint.symbolKey }];
                const coDef = own.some((m) => m.symbolKey === sameBody) ? own : [...own, { symbolKey: sameBody }];
                add({ ...hint, set: coDef });
            }
        }
        for (const k of enclosing)
            add({ kind: 'symbol', symbolKey: k });
        for (const m of usingMembers) {
            add({ kind: 'symbol', symbolKey: m.symbolKey, nestedOnly: m.nestedOnly, set: usingMembers });
        }
        add({ kind: 'symbol', symbolKey: ref }); // verbatim / bare top-level — LAST of the explicit readings
        // A bare `Program` may name the implicit class of a file of top-level statements, but only when no explicit reading binds: its fallback key comes after all of them.
        if (ref === 'Program')
            add({ kind: 'symbol', symbolKey: IMPLICIT_PROGRAM_KEY });
        if (candidates.length === 0)
            return;
        out.push({ candidates, kind: 'import', line });
    };
    /** Emit a two-reading attribute group (`written` and its `Attribute`-suffixed form) as ONE
     *  ordered group, each reading carrying its own alias/enclosing-ns/using/verbatim candidates,
     *  concatenated so the verbatim short form is reached only when nothing nearer binds. */
    const pushAttribute = (written, suffixed, enclosingNs, line, rooted, at) => {
        const before = out.length;
        pushRef(written, enclosingNs, line, rooted, at);
        if (suffixed !== undefined)
            pushRef(suffixed, enclosingNs, line, rooted, at);
        // Merge the (at most two) groups just pushed into one ordered group so both readings live
        // in a single reference (an attribute is ONE dependency, resolved by whichever name binds).
        mergeGroupsFrom(before, line);
    };
    /** Merge every group pushed since `before` into ONE ordered group (first-seen key order), so
     *  several readings of one reference resolve as a single dependency: the first reading that
     *  binds wins, and a present-but-ambiguous reading silences the rest. */
    const mergeGroupsFrom = (before, line) => {
        if (out.length <= before + 1)
            return;
        const merged = [];
        const seenK = new Set();
        for (const g of out.splice(before)) {
            for (const c of g.candidates) {
                if (c.kind === 'symbol') {
                    if (seenK.has(c.symbolKey))
                        continue;
                    seenK.add(c.symbolKey);
                }
                merged.push(c);
            }
        }
        out.push({ candidates: merged, kind: 'import', line });
    };
    /** The extension-method group for a call `value.Name(…)`: the extension keys of the enclosing
     *  namespaces innermost first, then the imported namespaces as ONE set (2+ owners declaring an
     *  in-scope `Name` → ambiguous → silence), then the global namespace. Aliases import no
     *  extension methods, and `using static` is not modelled, so neither contributes. */
    const pushExtension = (name, enclosingNs, line) => {
        // Distinct keys by construction: enclosing namespaces are distinct, the using prefixes are a
        // set, and a namespace both enclosing and imported only repeats a key the set already covers.
        const usingSet = usingPrefixes
            .filter((p) => !enclosingNs.includes(p))
            .map((p) => ({ symbolKey: extensionKey(p, name) }));
        const candidates = [
            ...enclosingNs.map((ns) => ({ kind: 'symbol', symbolKey: extensionKey(ns, name) })),
            ...usingSet.map((m) => ({ kind: 'symbol', symbolKey: m.symbolKey, set: usingSet })),
            { kind: 'symbol', symbolKey: extensionKey('', name) },
        ];
        out.push({ candidates, kind: 'import', line });
    };
    // Replay the descriptors in original emit order (static targets first, then alias-RHS embedded
    // types, then the main walk) — the order is load-bearing for the downstream reason order.
    for (const r of refs) {
        switch (r.kind) {
            case 'target': {
                // A named type of a using alias or `using static` target, read where the directive reads it (`directiveReadings`). A bare `Program` may be the implicit class of top-level statements, as in `pushRef`.
                // An alias's own plain target inside a namespace body (`nearest`) reads its nearest reading only: a nearer namespace of that name would hide every farther one.
                if (r.nearest === true && r.enclosingNs.length > 0) {
                    pushHints([{ kind: 'symbol', symbolKey: `${r.enclosingNs[0]}.${r.fqn}` }], r.line);
                    break;
                }
                const candidates = directiveReadings(r.enclosingNs, r.outer ?? [], r.fqn, '');
                if (r.fqn === 'Program')
                    candidates.push({ kind: 'symbol', symbolKey: IMPLICIT_PROGRAM_KEY });
                out.push({ candidates, kind: 'import', line: r.line });
                break;
            }
            case 'plain':
                pushRef(r.ref, r.enclosingNs, r.line, r.rooted, r.at);
                break;
            case 'alias': {
                // `S::Tail` (B5): rewrite the leftmost alias to its aliased FQN and resolve `N.Tail` from
                // the root (verbatim FQN). Fires ONLY when `S` is a confirmed alias in the MERGED map —
                // an extern/unknown alias (`Lib::A.B`) is dropped (its `::` text cannot collide with a
                // dot-only key → R13 silence-by-luck).
                const view = viewAlias(r.aliasName, r.enclosingNs, r.at);
                if (view !== undefined)
                    pushHints(aliasTargetHints(view, `.${r.tail}`), r.line);
                break;
            }
            case 'attr': {
                if (r.alias === undefined) {
                    pushAttribute(r.written, r.suffixed, r.enclosingNs, r.line, r.rooted === true, r.at);
                    break;
                }
                // `[S::Foo]`: both readings in the namespace `S` names, from the root (B5); nothing when `S` is no confirmed alias.
                const view = viewAlias(r.alias, r.enclosingNs, r.at);
                if (view !== undefined) {
                    const before = out.length;
                    pushHints(aliasTargetHints(view, `.${r.written}`), r.line);
                    if (r.suffixed !== undefined)
                        pushHints(aliasTargetHints(view, `.${r.suffixed}`), r.line);
                    mergeGroupsFrom(before, r.line);
                }
                break;
            }
            case 'receiver': {
                // Each dotted prefix of the receiver is one reading, leftmost first, merged into ONE group; a `global::` receiver reads each from the root only, where no alias applies.
                const rooted = r.rooted === true;
                if (!rooted && ambiguousAliases.has(r.chain[0]))
                    break;
                const before = out.length;
                for (let i = 1; i <= r.chain.length; i++)
                    pushRef(r.chain.slice(0, i).join('.'), r.enclosingNs, r.line, rooted, r.at);
                mergeGroupsFrom(before, r.line);
                break;
            }
            case 'ext':
                pushExtension(r.name, r.enclosingNs, r.line);
                break;
        }
    }
    return out;
}
/** The C# `uses()` — the delegating composition of the pure extract and the live assemble. The
 *  parity invariant `uses(file, opts) === assembleCsharpCandidates(extractCsharpRefs(file), opts)`
 *  holds by construction (this IS that composition). */
function uses(file, options = {}) {
    return assembleCsharpCandidates(extractCsharpRefs(file), options);
}
/** The C# `uses` with the optional cross-file global-using scope — called directly by the
 *  pass-level pre-pass (the consumer's relation pass) to inject project-wide `global using` prefixes. The interface
 *  `uses` (1-arg) on `csharpExtractor` delegates here with no options. */
export function csharpUses(file, options) {
    return uses(file, options);
}
export const csharpExtractor = {
    languages: new Set(['csharp']),
    rev: 8,
    declarations,
    uses,
};
