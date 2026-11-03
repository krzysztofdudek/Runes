import type { Node } from 'web-tree-sitter';
import { walk } from '../../ast/walk.mjs';
import { indexScopes, walkScoped } from './scope-walk.mjs';
import type { DependencyExtractor, DetectedDep, DeclaredSymbol, ParsedFile, TargetHint } from './types.mjs';
import { single } from './types.mjs';
import { isCapitalised, samePackageGroup, type SamePackageScope } from './jvm-same-package.mjs';

/**
 * Java dependency extractor.
 *
 * v1 scope = EXISTENCE, not relation type. An inter-component edge in Java comes from an IMPORT (an `import_declaration` names a fully-qualified type or, for a wildcard import, a package), from an inline fully-qualified type, and from a SIMPLE NAME of a type of the file's own package, which needs no import (see SAME-PACKAGE REFERENCES below). The extractor does not refine the relation type of a usage. It emits one path hint per import, whose specifier is a Java FULLY-QUALIFIED NAME (a type FQN, or a package FQN for a wildcard); the resolver maps that FQN → a file by Java's package = directory convention.
 *
 * SAME-PACKAGE REFERENCES. Every type in a package is visible by its simple name to every file of that package without an import (JLS §7.6), and a test in the package of the class it tests is the usual case. At each simple type name in a type position (a declaration's type, a generic argument, `extends`/`implements`/`throws`, a cast, `instanceof`, `new Foo()`, a `catch`, `Foo.class`, a pattern, an annotation) and at a capitalised receiver in an expression (`Foo.m()`, `Foo.X`, `Foo::m`) the extractor emits ONE ordered candidate group: first the member types a supertype of an enclosing declaration may inherit (`<Super>+<Name>`), then `<package>.<Name>`, resolved through the shared JVM namespace (so a Kotlin class of the package counts too) with the source-set rule of the resolver (`main` never sees `test`). The group is NOT emitted when the name is a type parameter in scope, a type the file declares (nested and local ones included), a single-type import or a single static import of that simple name (the import's own hint gives that edge), or, for an expression receiver, a variable of the file (JLS §6.4.2 obscuring, read file-wide). It wins over an on-demand import and `java.lang`, as in Java. Known limits: a member type inherited from a supertype OUTSIDE the repository (or from a supertype's own supertype) is not known, so a type of the package with that name in another owner gives a false edge; a field of that name that a static on-demand import or a supertype brings obscures a receiver and is not seen; and a file in the unnamed package emits nothing, because two directories of it are one package only when a build compiles them together.
 *
 * Each `import_declaration` carries one named `scoped_identifier` whose `.text` is
 * the dotted FQN (the grammar nests dotted names rightmost-outermost, so the
 * outermost node's `.text` is the complete dotted string — read it directly, never
 * reassemble segments). Two anonymous variant markers modify what that FQN means:
 *   - a `static` token child  (`import static com.foo.Bar.method;`) — the FQN's
 *     LAST segment is a member, not a type. Drop it: the dependency TYPE is
 *     `com.foo.Bar`. (A static-on-demand `import static com.foo.Bar.*;` has the
 *     asterisk instead, so it is handled by the wildcard branch and keeps the
 *     class FQN intact.)
 *   - an `asterisk` named child (`import com.foo.*;`) — the FQN is a PACKAGE prefix
 *     (`com.foo`), not a type. Emit the package FQN as-is; the resolver maps it to
 *     the package directory (any `.java` in it owns the dependency).
 *
 * `java.*` / `javax.*` / `jakarta.*` stdlib imports and any external-library import
 * still emit a hint here — silence is the RESOLVER's job (an FQN that maps to no
 * mapped `.java` resolves to undefined and is never flagged).
 *
 * INLINE FULLY-QUALIFIED TYPE references (`com.app.X x;`, `new com.app.X()`,
 * `extends com.app.Base`, `catch (com.app.E e)`, `List<com.app.Item>`) ARE emitted — as
 * SYMBOL hints, not path hints. A fully-qualified type written without an import appears in
 * the grammar as a `scoped_type_identifier` (dotted, e.g. `com.app.X`). This node type
 * occurs ONLY in TYPE positions: an EXPRESSION-position dotted access (`com.app.Helper.f()`)
 * parses as a `field_access`/`method_invocation` chain, NEVER a `scoped_type_identifier`, so
 * reading `scoped_type_identifier` captures type references exclusively and never the
 * member-access ambiguity. The hint is a SYMBOL hint resolved through the shared SymbolTable
 * (this is the one Java form that makes `declarations()` load-bearing): the table's
 * distinct-file rule silences any dotted name that could bind two ways (a fully-qualified
 * `com.app.Outer.Inner` resolves via the guarded `+`-split to the nested-type key; a
 * `Map.Entry`-style import-qualified nested ref matches no package key and stays silent), so
 * detection is additive recall with zero false positives. The OUTERMOST scoped_type_identifier
 * of a nested chain carries the complete dotted FQN — inner ones (the `scope` segments) are
 * skipped. Import declarations carry `scoped_identifier` (never `scoped_type_identifier`), so
 * they are untouched by this branch and stay path-resolved.
 *
 * MODULE IMPORT DECLARATIONS (`import module M;`, JEP 511, Java 25) are SKIPPED. The
 * operand is a MODULE name, not a type FQN or a package directory: the set of simple
 * names it brings lives in compiled module-path metadata (`java.base`'s jmods, a
 * third-party JAR) a hermetic source-only tool never reads, and a module exports many
 * packages from many directories, so there is no single path to map. A `module` import
 * is recognized by the `module` soft keyword and emitted as NO hint — so it can never
 * resolve to a phantom (in the pre-JEP-511 grammar an `import module M;` parses
 * malformed, with the swallowed `module` keyword leaving a whitespace-bearing pseudo-FQN
 * like `"module java.base"`; the same guard, plus a whitespace-validity backstop in
 * `emit`, drops it cleanly either way).
 *
 * MODULE DECLARATIONS (`module-info.java`) carry TYPE references in their `uses` /
 * `provides … with …` directives — genuine fully-qualified, shadow-free service-type
 * FQNs that resolve exactly like a single-type import. They ARE emitted as TYPE path
 * hints. The `requires` / `exports` / `opens` directives carry MODULE / PACKAGE names
 * (never types) and are EXCLUDED — mapping a module/package name to a `.java` would be a
 * phantom. (A `provides … with …` provider class is the kind of service-provider edge
 * the relation-conformance check tolerates as a declared relation even without code
 * backing; emitting it is sound — it is a real, shadow-free type reference.)
 */

/** Drop the trailing segment of a dotted FQN: `com.foo.Bar.method` → `com.foo.Bar`.
 *  Returns undefined when there is no segment to drop (a single bare segment). */
function dropLastSegment(fqn: string): string | undefined {
  const idx = fqn.lastIndexOf('.');
  if (idx <= 0) return undefined;
  return fqn.slice(0, idx);
}

/** The single FQN node of an `import_declaration`: its named `scoped_identifier`
 *  (or a bare `identifier` for a single-segment import). Returns its `.text`. */
function importFqn(decl: Node): string | undefined {
  for (let i = 0; i < decl.namedChildCount; i++) {
    const child = decl.namedChild(i);
    if (child === null) continue;
    if (child.type === 'scoped_identifier' || child.type === 'identifier') {
      return child.text;
    }
  }
  return undefined;
}

/** True when `decl` has an anonymous `static` token child (a static import). */
function isStaticImport(decl: Node): boolean {
  for (let j = 0; j < decl.childCount; j++) {
    const c = decl.child(j);
    if (c !== null && !c.isNamed && c.type === 'static') return true;
  }
  return false;
}

/** True when `decl` has a named `asterisk` child (a wildcard / on-demand import). */
function isWildcardImport(decl: Node): boolean {
  for (let j = 0; j < decl.childCount; j++) {
    const c = decl.child(j);
    if (c !== null && c.type === 'asterisk') return true;
  }
  return false;
}

/**
 * True when `decl` is a module import declaration `import module M;` (JEP 511, Java 25).
 * A module import names a MODULE, not a type/package — its imported set is unreadable
 * module-path metadata — so it must emit NO hint (see the file doc comment).
 *
 * Two recognition paths, covering grammar versions on both sides of JEP 511:
 *   - FUTURE grammar: an anonymous `module` token child (parallel to the `static`
 *     token of a static import).
 *   - PRE-JEP-511 grammar (the one shipped today): `import module M;` parses MALFORMED
 *     — the `module` soft keyword is swallowed as the first `identifier` of the
 *     `scoped_identifier`, leaving an ERROR node, so the node's text begins with the
 *     literal `module` followed by whitespace (`"module java.base"`). Detect the leading
 *     `module` identifier of an erroring scoped_identifier.
 */
function isModuleImport(decl: Node): boolean {
  for (let j = 0; j < decl.childCount; j++) {
    const c = decl.child(j);
    if (c !== null && !c.isNamed && c.type === 'module') return true; // future grammar
  }
  // Pre-JEP-511 fallback: a malformed `scoped_identifier` whose first identifier is the
  // swallowed `module` soft keyword.
  for (let i = 0; i < decl.namedChildCount; i++) {
    const child = decl.namedChild(i);
    if (child === null) continue;
    if (child.type === 'scoped_identifier' && child.hasError) {
      const firstId = firstIdentifierText(child);
      if (firstId === 'module') return true;
    }
  }
  return false;
}

/** The leftmost `identifier`'s text in a (possibly nested) `scoped_identifier`, or
 *  undefined. The grammar nests dotted names rightmost-outermost, so the leftmost leaf
 *  identifier is the first dotted segment. */
function firstIdentifierText(node: Node): string | undefined {
  let cur: Node | null = node;
  while (cur !== null) {
    if (cur.type === 'identifier') return cur.text;
    let next: Node | null = null;
    for (let i = 0; i < cur.namedChildCount; i++) {
      const c = cur.namedChild(i);
      if (c !== null && (c.type === 'scoped_identifier' || c.type === 'identifier')) {
        next = c;
        break;
      }
    }
    cur = next;
  }
  return undefined;
}

/** Type declarations whose simple name a file declares (a nested or local one included). */
const NAMED_TYPE_DECLARATIONS = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration',
]);

/** The body nodes inside which the members of a declaration's supertypes are in scope. */
const TYPE_BODIES = new Set(['class_body', 'interface_body', 'enum_body', 'annotation_type_body']);

/** The names a file binds as variables (fields, parameters, locals, pattern bindings, enum constants): a capitalised receiver of one of these names is a variable, which obscures a type of that name (JLS §6.4.2). Read file-wide, which only ever silences more. */
const VARIABLE_NAME_OWNERS = new Set([
  'variable_declarator',
  'formal_parameter',
  'catch_formal_parameter',
  'enhanced_for_statement',
  'instanceof_expression',
  'resource',
  'enum_constant',
]);

/** What the same-package binding needs to know of one file, read once. */
interface FileScope extends SamePackageScope {
  declared: Set<string>;
  imports: Map<string, string>;
  importedOther: Set<string>;
  onDemand: string[];
  /** Names the file binds as variables. */
  variables: Set<string>;
}

function lastSegment(fqn: string): string {
  return fqn.slice(fqn.lastIndexOf('.') + 1);
}

function fileScope(file: ParsedFile): FileScope | undefined {
  const pkg = packageFqn(file);
  // The unnamed package is not one namespace across a repository: two directories of it are the same package only when a build compiles them together, which a source tree does not say.
  if (pkg === '') return undefined;
  const scope: FileScope = { pkg, declared: new Set(), imports: new Map(), importedOther: new Set(), onDemand: [], variables: new Set() };
  walk(file.tree.rootNode, (node) => {
    if (NAMED_TYPE_DECLARATIONS.has(node.type)) {
      const name = node.childForFieldName('name')?.text;
      if (name !== undefined && name !== '') scope.declared.add(name);
    } else if (VARIABLE_NAME_OWNERS.has(node.type)) {
      const name = node.childForFieldName('name')?.text;
      if (name !== undefined) scope.variables.add(name);
    } else if (node.type === 'inferred_parameters') {
      for (let i = 0; i < node.namedChildCount; i++) scope.variables.add(node.namedChild(i)?.text ?? '');
    } else if (node.type === 'lambda_expression') {
      const p = node.childForFieldName('parameters');
      if (p?.type === 'identifier') scope.variables.add(p.text);
    } else if (node.type === 'type_pattern' || node.type === 'record_pattern_component') {
      const last = node.namedChild(node.namedChildCount - 1);
      if (last?.type === 'identifier') scope.variables.add(last.text);
    } else if (node.type === 'import_declaration') {
      if (isModuleImport(node)) return false;
      const fqn = importFqn(node);
      if (fqn === undefined) return false;
      if (isWildcardImport(node)) {
        if (!isStaticImport(node)) scope.onDemand.push(fqn);
      } else if (isStaticImport(node)) {
        scope.importedOther.add(lastSegment(fqn));
      } else {
        scope.imports.set(lastSegment(fqn), fqn);
      }
      return false;
    }
    return undefined;
  });
  return scope;
}

/** The simple (or dotted) name a supertype node reads as, or undefined for a form not read. */
function superTypeName(node: Node): string | undefined {
  if (node.type === 'type_identifier' || node.type === 'scoped_type_identifier') return node.text;
  if (node.type === 'generic_type') {
    const head = node.namedChild(0);
    return head === null ? undefined : superTypeName(head);
  }
  return undefined;
}

/** The names of the supertypes a type declaration (or an anonymous class creation) extends or implements. */
function superTypeNames(decl: Node): string[] {
  const out: string[] = [];
  const take = (n: Node | null): void => {
    if (n === null) return;
    for (let i = 0; i < n.namedChildCount; i++) {
      const c = n.namedChild(i);
      if (c === null) continue;
      if (c.type === 'type_list') take(c);
      else {
        const name = superTypeName(c);
        if (name !== undefined) out.push(name);
      }
    }
  };
  if (decl.type === 'object_creation_expression') {
    const t = decl.childForFieldName('type');
    const name = t === null ? undefined : superTypeName(t);
    if (name !== undefined) out.push(name);
    return out;
  }
  take(decl.childForFieldName('superclass'));
  take(decl.childForFieldName('interfaces'));
  for (let i = 0; i < decl.namedChildCount; i++) {
    const c = decl.namedChild(i);
    if (c?.type === 'extends_interfaces') take(c);
  }
  return out;
}

/** The names a `type_parameters` node declares. */
function typeParameterNames(node: Node): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i)?.namedChild(0);
    if (c !== null && c !== undefined) out.add(c.text);
  }
  return out;
}

/**
 * The ordered candidates for one simple type name written without an import, in the file's package (JLS §6.4.1, §6.3, §7.6), see samePackageGroup: nothing when the name is a type parameter in scope; the member types a supertype of an enclosing declaration may inherit (collected here from the declarations whose body holds the use), then the package's own type.
 */
function samePackageCandidates(scope: FileScope, name: string, around: AroundScope): TargetHint[] | undefined {
  const supertypeLists: string[][] = [];
  for (let t = around.typeParameters; t !== null; t = t.outer) if (t.names.has(name)) return undefined;
  for (let s = around.supertypes; s !== null; s = s.outer) supertypeLists.push(s.names);
  return samePackageGroup(scope, name, supertypeLists);
}

/**
 * What the declarations around a node say about the simple names written in it, carried down the walk instead of read by climbing from each node: `typeParameters` links the type parameters of every ancestor that declares some, `supertypes` the supertype names of every enclosing type body (innermost first), and `entering` the declaration (or anonymous class creation) whose children are being entered, so that its supertypes count for the child that is a body and for no other.
 */
interface AroundScope {
  readonly typeParameters: { readonly names: Set<string>; readonly outer: AroundScope['typeParameters'] } | null;
  readonly supertypes: { readonly names: string[]; readonly outer: AroundScope['supertypes'] } | null;
  readonly entering: Node | null;
}

const OUTSIDE: AroundScope = { typeParameters: null, supertypes: null, entering: null };

/** The scope around every node of a compilation unit, by node id. */
function aroundScopes(root: Node): Map<number, AroundScope> {
  return indexScopes<AroundScope>(
    [root],
    OUTSIDE,
    (node, seen) => {
      const typeParameters = node.childForFieldName('type_parameters');
      const declares = typeParameters !== null;
      const entering = NAMED_TYPE_DECLARATIONS.has(node.type) || node.type === 'object_creation_expression' ? node : null;
      if (!declares && entering === null) return undefined;
      return { typeParameters: declares ? { names: typeParameterNames(typeParameters), outer: seen.typeParameters } : seen.typeParameters, supertypes: seen.supertypes, entering };
    },
    (node, inherited) => {
      if (inherited.entering === null) return inherited;
      // The declaration's supertypes reach only what is inside its body.
      const supertypes = TYPE_BODIES.has(node.type) ? { names: superTypeNames(inherited.entering), outer: inherited.supertypes } : inherited.supertypes;
      return { typeParameters: inherited.typeParameters, supertypes, entering: null };
    },
  );
}

/** True when `n` is the receiver of a member access or method reference: `Owner` of `Owner.m()`, `Owner.X`, `Owner::m`. */
function isReceiver(n: Node): boolean {
  const p = n.parent;
  if (p === null) return false;
  if (p.type === 'method_invocation' || p.type === 'field_access') return p.childForFieldName('object')?.id === n.id;
  if (p.type === 'method_reference') return p.namedChild(0)?.id === n.id;
  return false;
}

function uses(file: ParsedFile): DetectedDep[] {
  const out: DetectedDep[] = [];
  const seen = new Set<string>();
  const scope = fileScope(file);
  const scopes = scope === undefined ? new Map<number, AroundScope>() : aroundScopes(file.tree.rootNode);

  // Same-package references (no import): one ordered candidate group per simple name, see samePackageCandidates.
  const seenGroups = new Set<string>();
  const emitSamePackage = (name: string, node: Node): void => {
    if (scope === undefined || name === '' || name === 'var') return;
    const candidates = samePackageCandidates(scope, name, scopes.get(node.id)!);
    if (candidates === undefined) return;
    const line = node.startPosition.row + 1;
    const dedupKey = `${candidates.map((c) => (c.kind === 'symbol' ? c.symbolKey : '')).join('|')} ${line}`;
    if (seenGroups.has(dedupKey)) return;
    seenGroups.add(dedupKey);
    out.push({ candidates, kind: 'type-ref', line });
  };
  // A name in a type position: not a type parameter's own name, not the member of a qualified type (`Entry` of `Map.Entry`), not a package segment (`com` of `com.app.X`), not the type of `outer.new Inner()`.
  const typeIdentifier = (node: Node): void => {
    const p = node.parent;
    if (p === null) return;
    if (p.type === 'type_parameter' && p.namedChild(0)?.id === node.id) return;
    if (p.type === 'scoped_type_identifier' && (p.namedChild(0)?.id !== node.id || !isCapitalised(node.text))) return;
    if (p.type === 'object_creation_expression' && p.child(0)?.type !== 'new') return;
    emitSamePackage(node.text, node);
  };
  const identifier = (node: Node): void => {
    const p = node.parent;
    if (p === null) return;
    if ((p.type === 'marker_annotation' || p.type === 'annotation') && p.childForFieldName('name')?.id === node.id) {
      emitSamePackage(node.text, node);
    } else if (p.type === 'record_pattern' && p.namedChild(0)?.id === node.id) {
      emitSamePackage(node.text, node);
    } else if (isCapitalised(node.text) && isReceiver(node) && scope !== undefined && !scope.variables.has(node.text)) {
      emitSamePackage(node.text, node);
    }
  };

  const emit = (specifier: string | undefined, node: Node, isPackage = false): void => {
    if (specifier === undefined || specifier === '') return;
    // Whitespace-validity backstop: a real Java FQN has no whitespace. A specifier that
    // contains any (e.g. the malformed `"module java.base"` of a pre-JEP-511 `import
    // module` parse) is not a resolvable FQN — drop it rather than risk a phantom path.
    if (/\s/.test(specifier)) return;
    const line = node.startPosition.row + 1;
    const dedupKey = `${specifier} ${line}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    out.push(single({ kind: 'path', specifier, isPackage }, 'import', line));
  };

  // Inline fully-qualified type references resolve as SYMBOL hints (see file doc comment).
  // Keyed separately from the path-hint dedup so an FQN that appears both as an import and
  // inline is not cross-suppressed (different hint kinds, different resolution axes).
  const seenSym = new Set<string>();
  const emitSymbol = (symbolKey: string, node: Node): void => {
    if (symbolKey === '' || /\s/.test(symbolKey)) return;
    const line = node.startPosition.row + 1;
    const dedupKey = `${symbolKey} ${line}`;
    if (seenSym.has(dedupKey)) return;
    seenSym.add(dedupKey);
    out.push(single({ kind: 'symbol', symbolKey }, 'type-ref', line));
  };

  walk(file.tree.rootNode, (node) => {
    if (node.type === 'type_identifier') {
      typeIdentifier(node);
      return undefined;
    }
    if (node.type === 'identifier') {
      identifier(node);
      return undefined;
    }

    // Inline FQN type reference: the OUTERMOST scoped_type_identifier of a chain carries the
    // complete dotted FQN; inner ones are its `scope` segments. Type positions only — an
    // expression-position dotted access is a field_access chain, never this node.
    if (node.type === 'scoped_type_identifier' && node.parent?.type !== 'scoped_type_identifier') {
      emitSymbol(node.text, node);
      return undefined;
    }

    // `module-info.java`: emit the TYPE references of `uses` / `provides … with …`
    // directives ONLY (shadow-free service-type FQNs). `requires` / `exports` / `opens`
    // carry module/package names and are skipped (they are not `*_module_directive`
    // type-bearing forms we read).
    if (node.type === 'uses_module_directive' || node.type === 'provides_module_directive') {
      for (let i = 0; i < node.namedChildCount; i++) {
        const c = node.namedChild(i);
        if (c !== null && (c.type === 'scoped_identifier' || c.type === 'identifier')) {
          emit(c.text, c);
        }
      }
      return undefined;
    }

    if (node.type !== 'import_declaration') return undefined;

    // `import module M;` (JEP 511) names a module, not a type/package → emit nothing.
    if (isModuleImport(node)) return undefined;

    const fqn = importFqn(node);
    if (fqn === undefined) return undefined;

    const wildcard = isWildcardImport(node);
    const isStatic = isStaticImport(node);

    if (wildcard) {
      // `import com.foo.*;`            → package FQN `com.foo` (a directory of types).
      // `import static com.foo.Bar.*;` → the scoped_identifier IS the class FQN
      //   `com.foo.Bar` (static-on-demand); it is a TYPE, not a package.
      emit(fqn, node, /* isPackage */ !isStatic);
    } else if (isStatic) {
      // `import static com.foo.Bar.method;` → drop the trailing member → type FQN.
      emit(dropLastSegment(fqn), node);
    } else {
      // Plain single-type import → the FQN is the type.
      emit(fqn, node);
    }
    return undefined;
  });

  return out;
}

const DECLARATION_TYPES = NAMED_TYPE_DECLARATIONS;

/** The package FQN of a compilation unit, read from its `package_declaration`'s
 *  `scoped_identifier` (a bare `identifier` for a single-segment package). Empty string
 *  for the unnamed/default package. */
function packageFqn(file: ParsedFile): string {
  let pkg = '';
  walk(file.tree.rootNode, (node) => {
    if (node.type !== 'package_declaration') return undefined;
    for (let i = 0; i < node.namedChildCount; i++) {
      const c = node.namedChild(i);
      if (c !== null && (c.type === 'scoped_identifier' || c.type === 'identifier')) {
        pkg = c.text;
        return false; // first package_declaration wins; stop descending it
      }
    }
    return false;
  });
  return pkg;
}

/**
 * The FULLY-QUALIFIED symbol keys this file DEFINES. Java IMPORTS resolve by PATH first (the
 * package = directory convention under the importing file's ancestors), and fall back to this
 * table — the JVM namespace Java shares with Kotlin — only when that probe misses (a sibling
 * Maven/Gradle module, `src/test` → `src/main`, a Kotlin class or file facade; see resolver.ts).
 * The INLINE FULLY-QUALIFIED TYPE form (`uses()` emits a `symbol` hint for a
 * `scoped_type_identifier`) always resolves through the table. Either way the table's
 * distinct-file rule + guarded `+`-split give ambiguity→silence. Reads
 * the file's `package_declaration`, then for each `class`/`interface`/`enum`/`record`
 * declaration (top-level AND nested) emits `<package>.<TypeKey>` (or `<TypeKey>` for the
 * unnamed package).
 *
 * `<TypeKey>` is the enclosing-TYPE chain joined to the declaration's own simple name by `+`:
 * a top-level `Order` is `Order`; a nested `Inner` inside `Outer` is `Outer+Inner`. A NESTED
 * declaration emits ONLY its `+` key — NEVER also a bare flat `Inner`. Keying a nested type
 * flat (the latent v1 shape, mirrored on the pre-fix Kotlin bug) manufactured a phantom
 * top-level name: `class Outer { class Inner }` produced the bare `Inner`, which — the instant
 * any Java symbol consumer existed — a top-level `import <pkg>.Inner` (in Java that names a
 * TOP-LEVEL type, never the nested `Outer.Inner`) would mis-bind to this file (a false
 * positive), or which would collide with a real `<pkg>.Inner` in another node and silence its
 * legitimate edge. The `+` key lives in a string space disjoint from the dot-only namespace,
 * so it cannot collide; a nested-type use resolves to it through the resolver's guarded
 * `+`-boundary split — e.g. an inline `new com.app.Outer.Inner()` symbol hint splits at the
 * declared `com.app.Outer` type to the `com.app.Outer+Inner` key.
 */
function declarations(file: ParsedFile): DeclaredSymbol[] {
  const out: DeclaredSymbol[] = [];
  const pkg = packageFqn(file);
  // The scope is the enclosing-TYPE chain, outermost first, joined by the reflection separator `+` (Java's JVM binary name is `Outer$Inner`; the analyzer's canonical key is `Outer+Inner` — same boundary), DISJOINT from the package `.` so a nested key lives in a string space no dot-only candidate can collide with (separator isolation). It is empty for a top-level declaration, and carried down the walk: the `name` of every ancestor `class`/`interface`/`enum`/`record` declaration.
  walkScoped<string>(file.tree.rootNode, '', (node, enclosing) => {
    if (!DECLARATION_TYPES.has(node.type)) return undefined;
    const nameNode = node.childForFieldName('name');
    if (nameNode === null || nameNode.text === '') return undefined;
    const typeKey = enclosing === '' ? nameNode.text : `${enclosing}+${nameNode.text}`;
    const symbolKey = pkg === '' ? typeKey : `${pkg}.${typeKey}`;
    out.push({ symbolKey, line: node.startPosition.row + 1 });
    return typeKey;
  });
  return out;
}

export const javaExtractor: DependencyExtractor = {
  languages: new Set(['java']),
  rev: 4,
  declarations,
  uses,
};
