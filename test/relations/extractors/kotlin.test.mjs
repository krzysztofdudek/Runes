// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { kotlinExtractor } from '../../helpers/internal/relations.mjs';
import { SymbolTable } from '@chrisdudek/runes/relations';
import { makeResolver } from '@chrisdudek/runes/relations';
import { withParsedFiles, } from '../../helpers/tree-sitter.mjs';
import { kotlinView } from '../../helpers/internal/relations.mjs';

const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

/** A Kotlin (path, code) pair as a withParsedFiles spec. */
const kt = (path, code) => ({ path, code, language: 'kotlin' });

describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)', () => {
  it('emits the imported FQN as a symbol hint for a single-type import', async () => {
    const { uses } = await run('package com.acme.app\nimport com.acme.payments.PaymentService\nclass C\n');
    expect(uses).toContainEqual(
      expect.objectContaining({
        candidates: [{ kind: 'symbol', symbolKey: 'com.acme.payments.PaymentService' }],
        kind: 'import',
      }),
    );
    // It must NOT be a path hint — Kotlin resolves through the SymbolTable.
    expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
  });

  it('IGNORES the alias of `import ... as B` — the hint is the real FQN', async () => {
    const { uses } = await run('import com.acme.util.Helpers as H\nclass C\n');
    const keys = symbolKeys(uses);
    expect(keys).toContain('com.acme.util.Helpers');
    // The alias `H` is a local binding only — never the dependency target.
    expect(keys).not.toContain('H');
    expect(keys.every((k) => !k.includes(' as '))).toBe(true);
  });

  it('emits `<package>.*` for a star import (the resolver collapses it by owner)', async () => {
    const { uses } = await run('import com.acme.audit.*\nimport com.acme.audit.Log\nclass C\n');
    const keys = symbolKeys(uses);
    // The `*` is a separate token; the qualified_identifier is the package, re-marked with `.*`.
    expect(keys).toContain('com.acme.audit.*');
    expect(keys).toContain('com.acme.audit.Log');
    expect(keys).not.toContain('com.acme.audit');
  });

  it('emits a stdlib/external import FQN unchanged (silencing is the SymbolTable job)', async () => {
    const { uses } = await run('import kotlin.collections.List\nimport java.util.ArrayList\nclass C\n');
    const keys = symbolKeys(uses);
    expect(keys).toContain('kotlin.collections.List');
    expect(keys).toContain('java.util.ArrayList');
  });

  it('collects every import in a multi-import file', async () => {
    const { uses } = await run(
      ['package com.acme.app', 'import com.acme.a.Alpha', 'import com.acme.b.Beta', 'class C', ''].join('\n'),
    );
    const keys = symbolKeys(uses);
    expect(keys).toContain('com.acme.a.Alpha');
    expect(keys).toContain('com.acme.b.Beta');
  });

  it('deduplicates two identical imports that begin on the same line', async () => {
    // Two `import a.B` statements on ONE line collide on the `<symbolKey> <line>` dedup
    // key — only one symbol hint is emitted (the seen-set true-arm).
    const { uses } = await run('import a.B;import a.B\nclass C\n');
    expect(symbolKeys(uses)).toEqual(['a.B']);
  });

  it('emits a SYMBOL hint for an inline fully-qualified TYPE reference (type position is shadow-free)', async () => {
    // A multi-segment user_type written inline in a TYPE position — supertype list,
    // by-delegation supertype, property / parameter / return type — is a fully-qualified
    // name with exactly one meaning, so it resolves through the SymbolTable like an import.
    const { uses } = await run(
      [
        'package com.acme.app',
        'class C : com.acme.base.Base(), com.acme.flow.Flowable by delegate {',
        '  val r: com.acme.model.Repo? = null',
        '  fun m(l: com.acme.metrics.Logger): com.acme.model.Result = TODO()',
        '}',
        '',
      ].join('\n'),
    );
    const keys = symbolKeys(uses);
    expect(keys).toContain('com.acme.base.Base'); // superclass
    expect(keys).toContain('com.acme.flow.Flowable'); // by-delegation supertype
    expect(keys).toContain('com.acme.model.Repo'); // property type
    expect(keys).toContain('com.acme.metrics.Logger'); // parameter type
    expect(keys).toContain('com.acme.model.Result'); // return type
    // The hints are SYMBOL hints (Kotlin resolves through the SymbolTable, never a path).
    expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
  });

  it('emits NOTHING for EXPRESSION-position references (ctor call, qualified call, `::member`, `::class`)', async () => {
    // An EXPRESSION-position reference — a constructor call, a qualified member call, a
    // `::member` callable reference, a `::class` literal — parses as a navigation_expression /
    // member-access chain that is indistinguishable from `localVariable.field.method`, so
    // binding it could pick the wrong target. It is deliberately left silent (zero-FP boundary).
    const { uses } = await run(
      [
        'package com.acme.app',
        'fun m() {',
        '  val t = com.acme.metrics.Timer()',
        '  com.acme.audit.AuditLog.record("x")',
        '  val ref = com.acme.util.Helpers::format',
        '  val k = com.acme.model.Order::class',
        '}',
        '',
      ].join('\n'),
    );
    expect(uses).toHaveLength(0);
  });
});

describe('kotlin extractor — declarations() produce <package>.<Name> FQN keys', () => {
  it('prefixes class / interface / object / function / property / typealias with the package', async () => {
    const { declarations } = await run(
      [
        'package com.acme.app',
        'class Foo',
        'interface Bar',
        'object Baz',
        'fun qux() {}',
        'val quux = 1',
        'typealias Money = Long',
        '',
      ].join('\n'),
    );
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('com.acme.app.Foo');
    expect(keys).toContain('com.acme.app.Bar'); // interface parses as class_declaration
    expect(keys).toContain('com.acme.app.Baz');
    expect(keys).toContain('com.acme.app.qux');
    expect(keys).toContain('com.acme.app.quux');
    expect(keys).toContain('com.acme.app.Money');
  });

  it('uses the BARE name when the file has no package_header (root package / .kts)', async () => {
    const { declarations } = await run('class Foo\nfun bar() {}\n');
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('Foo');
    expect(keys).toContain('bar');
    expect(keys.every((k) => !k.startsWith('.'))).toBe(true);
  });

  it('indexes a modifier-prefixed property (skips the leading non-variable_declaration child)', async () => {
    // `const val PI = 3` puts a `modifiers` node before the `variable_declaration`, so
    // the property loop skips the first named child (it is not a variable_declaration)
    // before finding the name. The FQN is still emitted.
    const { declarations } = await run('package com.acme.app\nconst val PI = 3\n');
    expect(declarations.map((d) => d.symbolKey)).toContain('com.acme.app.PI');
  });

  it('emits NO key for a destructuring property declaration (no single name)', async () => {
    // `val (a, b) = pair` nests a `multi_variable_declaration`, not a
    // `variable_declaration`; v1 indexes only the single-name form, so declarationName
    // yields nothing and the declaration is skipped — no symbol key for a or b.
    const { declarations } = await run('package com.acme.app\nval (a, b) = pair\n');
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).not.toContain('com.acme.app.a');
    expect(keys).not.toContain('com.acme.app.b');
  });

  it('carries a 1-based line number for each declaration', async () => {
    const { declarations } = await run('package p\n\nclass OnLineThree\n');
    const foo = declarations.find((d) => d.symbolKey === 'p.OnLineThree');
    expect(foo?.line).toBe(3);
  });
});

describe('kotlin SYMBOL-TABLE resolution — the half this language validates', () => {
  it("builds a SymbolTable from two files' declarations() and resolves a third file's import hint to the right file", async () => {
    // Two declaring files in different packages, plus a consumer that imports one of them.
    await withParsedFiles(
      [
        kt('src/a/PaymentService.kt', 'package com.acme.payments\nclass PaymentService\n'),
        kt('src/b/AuditLog.kt', 'package com.acme.audit\nobject AuditLog\n'),
        kt('src/c/Order.kt', 'package com.acme.orders\nimport com.acme.payments.PaymentService\nclass Order\n'),
      ],
      ([fileA, fileB, consumer]) => {
        // Build the shared SymbolTable exactly as pass.ts step 4 does.
        const st = new SymbolTable();
        for (const f of [fileA, fileB]) {
          for (const d of kotlinExtractor.declarations(f)) st.declare('kotlin', d.symbolKey, f.path);
        }

        // The consumer's import hint must resolve to fileA via resolveUnique.
        const uses = kotlinExtractor.uses(consumer);
        const importHint = uses.find((u) => u.candidates[0].kind === 'symbol');
        expect(importHint?.candidates[0]).toEqual({ kind: 'symbol', symbolKey: 'com.acme.payments.PaymentService' });
        expect(st.resolveUnique('kotlin', 'com.acme.payments.PaymentService')).toBe('src/a/PaymentService.kt');

        // And the full resolver wires symbol → owner node (mirrors resolver.ts).
        const ownerIndex = { ownerOf: (f) => (f === 'src/a/PaymentService.kt' ? 'a' : f === 'src/b/AuditLog.kt' ? 'b' : undefined) };
        const resolver = makeResolver({ ownerIndex: ownerIndex, symbolTable: st, resolvePathToFile: () => undefined });
        expect(resolver.resolve(importHint.candidates[0], consumer.path, 'kotlin')).toEqual({
          owner: 'a',
          resolvedFile: 'src/a/PaymentService.kt',
        });
      },
    );
  });

  it('AMBIGUITY: two files declaring the SAME FQN → a use of it resolves to undefined (silence, no flag)', async () => {
    // Two files both declare com.acme.dup.Thing — the FQN is ambiguous.
    await withParsedFiles(
      [
        kt('src/x/Thing.kt', 'package com.acme.dup\nclass Thing\n'),
        kt('src/y/Thing.kt', 'package com.acme.dup\nclass Thing\n'),
        kt('src/z/Use.kt', 'package com.acme.z\nimport com.acme.dup.Thing\nclass Use\n'),
      ],
      ([fileX, fileY, consumer]) => {
        const st = new SymbolTable();
        for (const f of [fileX, fileY]) {
          for (const d of kotlinExtractor.declarations(f)) st.declare('kotlin', d.symbolKey, f.path);
        }

        // resolveUnique returns undefined for the ambiguous FQN.
        expect(st.resolveUnique('kotlin', 'com.acme.dup.Thing')).toBeUndefined();

        // Through the resolver the use also resolves to undefined — silence, never a flag.
        const ownerIndex = { ownerOf: (f) => f.split('/')[1] }; // src/<node>/… — the two declaring files are two NODES
        const resolver = makeResolver({ ownerIndex: ownerIndex, symbolTable: st, resolvePathToFile: () => undefined });
        const importHint = kotlinExtractor.uses(consumer).find((u) => u.candidates[0].kind === 'symbol');
        expect(resolver.resolve(importHint.candidates[0], consumer.path, 'kotlin')).toBeUndefined();
      },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Parse recovery (kotlin-recover.ts): syntax the shipped grammar predates must not erase the
// declarations after it, and what stays unreadable must fail closed.
describe('kotlin extractor — parse recovery for Kotlin 2.2+ syntax', () => {
  const keysOf = (decls) => decls.map((d) => d.symbolKey);

  it('a when-guard no longer erases later declarations, imports-after types, or line numbers', async () => {
    const { declarations, uses } = await run(
      [
        'package p',
        'fun kind(v: Any) = when (v) {',
        '    is String if v.isNotEmpty() -> 1',
        '    else if v == 0 -> 2',
        '    else -> 3',
        '}',
        'class After',
        'val repo: com.acme.data.Repo? = null',
        '',
      ].join('\n'),
    );
    const keys = keysOf(declarations);
    expect(keys).toEqual(expect.arrayContaining(['p.kind', 'p.After', 'p.repo']));
    expect(keys.some((k) => k.endsWith('*'))).toBe(false); // fully recovered → no marker
    expect(declarations.find((d) => d.symbolKey === 'p.After')?.line).toBe(7);
    expect(symbolKeys(uses)).toContain('com.acme.data.Repo');
  });

  it('a multi-dollar string (plain and raw, with a `$${…}` template) no longer erases later declarations', async () => {
    const { declarations } = await run(
      ['package p', 'val a = $$"price: $$amount"', 'val b = $$"""{ "$schema": "$${id}" }"""', 'class After', ''].join('\n'),
    );
    expect(keysOf(declarations)).toEqual(expect.arrayContaining(['p.a', 'p.b', 'p.After']));
    expect(keysOf(declarations).some((k) => k.endsWith('*'))).toBe(false);
  });

  it('a context-parameter clause (top level and on a member) keeps the decorated declarations', async () => {
    const { declarations } = await run(
      [
        'package p',
        'context(log: Logger)',
        'fun save() {}',
        'class Svc {',
        '    context(log: Logger, tx: Tx)',
        '    fun run() {}',
        '    fun other() {}',
        '}',
        '',
      ].join('\n'),
    );
    expect(keysOf(declarations)).toEqual(expect.arrayContaining(['p.save', 'p.Svc', 'p.Svc+run', 'p.Svc+other']));
    expect(keysOf(declarations).some((k) => k.endsWith('*'))).toBe(false);
  });

  it('an unreadable declaration marks the package incomplete and never trusts a name behind the damage', async () => {
    const { declarations } = await run(['package p', 'public %% class Thing', 'class Other', ''].join('\n'));
    const keys = keysOf(declarations);
    expect(keys).toContain('p.*');
    expect(keys).toContain('p.Other');
    expect(keys).not.toContain('p.Thing');
  });

  it('a class whose body cannot be parsed keeps its name and marks its members incomplete; later classes survive', async () => {
    const { declarations } = await run(
      ['package p', 'class Box {', '  public %% fun hidden() {}', '  fun shown() {}', '}', 'class After', ''].join('\n'),
    );
    const keys = keysOf(declarations);
    expect(keys).toEqual(expect.arrayContaining(['p.Box', 'p.Box+*', 'p.After']));
    expect(keys).not.toContain('p.*');
    expect(keys).not.toContain('p.Box+hidden');
  });

  it('a file the grammar reads cleanly gets no marker', async () => {
    const { declarations } = await run('package p\nclass A\nfun f() = 1\n');
    expect(keysOf(declarations).some((k) => k.includes('*'))).toBe(false);
  });

  it('a one-line class body (a MISSING separator in the shipped grammar, no ERROR) is read as it stands', async () => {
    const { declarations } = await run('package p\nclass A { val x = 1 }\nclass B\n');
    const keys = keysOf(declarations);
    expect(keys).toEqual(expect.arrayContaining(['p.A', 'p.A+x', 'p.B']));
    expect(keys.some((k) => k.includes('*'))).toBe(false);
  });
});

describe('kotlin extractor — top-level declarations the shipped grammar misreads without an ERROR', () => {
  // The shipped grammar reads an annotation followed by a soft-keyword modifier (`annotation`, `enum`, `data`, `const`, `expect`, `actual`) at the top level as an annotated script expression or an assignment, with no ERROR node. Each such declaration is read from its leading tokens, like a damaged one.
  const cases = [
    ['import javax.inject.Qualifier\n\n@Qualifier\n@Retention(AnnotationRetention.RUNTIME)\nannotation class D1', ['com.acme.D1', 'com.acme.D1+*'], 6],
    ['@Target(AnnotationTarget.FUNCTION)\nannotation class D4', ['com.acme.D4', 'com.acme.D4+*'], 3],
    ['@Serializable\nenum class D6 {\n  A\n}', ['com.acme.D6', 'com.acme.D6+*'], 3],
    ['@Serializable enum class C1 { X }', ['com.acme.C1', 'com.acme.C1+*'], 2],
    ['@Keep annotation class C7', ['com.acme.C7', 'com.acme.C7+*'], 2],
    ['@Keep\ndata object E2', ['com.acme.E2', 'com.acme.E2+*'], 3],
    ['@Keep enum class E { A; fun f() = 1 }', ['com.acme.E', 'com.acme.E+*'], 2],
    ['@Keep\nexpect class X', ['com.acme.X', 'com.acme.X+*'], 3],
    ['@Keep\nconst val E14 = 1', ['com.acme.E14', 'com.acme.XKt'], 3],
    ['@Keep\nactual typealias Y = Int', ['com.acme.Y', 'com.acme.XKt'], 3],
  ];
  for (const [body, keys, line] of cases) {
    it(`declares ${keys[0]} (${keys[1]})`, async () => {
      const { declarations } = await run(`package com.acme\n${body}\n`);
      expect(declarations.map((d) => d.symbolKey)).toEqual(keys);
      expect(declarations[0].line).toBe(line);
    });
  }

  it('keeps the inline FQN types of a misread declaration among its uses', async () => {
    const { declarations, uses } = await run('package p\n@com.acme.meta.Marker annotation class Q\nclass After\n');
    expect(declarations.map((d) => d.symbolKey)).toEqual(['p.After', 'p.Q', 'p.Q+*']);
    expect(symbolKeys(uses)).toContain('com.acme.meta.Marker');
  });

  it('reads a misread declaration in a file that also needs recovery', async () => {
    for (const damage of ['fun kind(v: Any) = when (v) {\n    is String if v.isNotEmpty() -> 1\n    else -> 3\n}', 'public %% class Thing']) {
      const { declarations } = await run(`package p\n${damage}\n@Keep annotation class Q\nclass After\n`);
      expect(declarations.map((d) => d.symbolKey), damage).toEqual(expect.arrayContaining(['p.Q', 'p.Q+*', 'p.After']));
    }
  });

  it('a script statement that is no declaration stays undeclared', async () => {
    const { declarations } = await runExtractor(kotlinExtractor, 'kotlin', '.kts', 'version = "1.0"\n@Suppress("x") foo()\n@Keep value = 2\n');
    expect(declarations).toEqual([]);
  });
});

describe('kotlin extractor — local declarations and JVM file facades', () => {
  it('does not key declarations local to a function, lambda, init block, accessor, constructor or object expression', async () => {
    const { declarations } = await run(
      [
        'package p',
        'class R {',
        '    fun render(): String { val format = "%d"; class Row; fun helper() = 1; return format }',
        '    init { val fromInit = 2 }',
        '    val p: Int get() { val inGetter = 1; return inGetter }',
        '    constructor(x: Int) { val inCtor = x }',
        '    val member = 3',
        '}',
        'fun top() = listOf(1).map { val inLambda = it; inLambda }',
        'val anon = object : Any() { val inObject = 1 }',
        '',
      ].join('\n'),
    );
    const keys = declarations.map((d) => d.symbolKey);
    for (const local of ['format', 'Row', 'helper', 'fromInit', 'inGetter', 'inCtor', 'inLambda', 'inObject']) {
      expect(keys.some((k) => k === `p.${local}` || k.endsWith(`+${local}`))).toBe(false);
    }
    expect(keys).toEqual(expect.arrayContaining(['p.R', 'p.R+render', 'p.R+member', 'p.top', 'p.anon']));
  });

  it('declares the `<File>Kt` facade for a file with a top-level function or property, the @file:JvmName name when given, none for classes only', async () => {
    await withParsedFiles(
      [
        kt('src/a/order-utils.kt', 'package p\nfun place() {}\n'),
        kt('src/b/Pricing.kt', '@file:JvmName("PriceMath")\npackage p\nval VAT = 23\n'),
        kt('src/c/Model.kt', 'package p\nclass Model\n'),
        kt('src/d/script.kts', 'package p\nfun run() {}\n'),
      ],
      ([a, b, c, d]) => {
        expect(kotlinExtractor.declarations(a).map((x) => x.symbolKey)).toContain('p.Order_utilsKt');
        const bKeys = kotlinExtractor.declarations(b).map((x) => x.symbolKey);
        expect(bKeys).toContain('p.PriceMath');
        expect(bKeys).not.toContain('p.PricingKt');
        expect(kotlinExtractor.declarations(c).map((x) => x.symbolKey).some((k) => k.endsWith('Kt'))).toBe(false);
        expect(kotlinExtractor.declarations(d).map((x) => x.symbolKey).some((k) => k.endsWith('Kt'))).toBe(false);
      },
    );
  });
});

describe('kotlin extractor — parse recovery reads headers and lexes defensively', () => {
  const keysOf = (decls) => decls.map((d) => d.symbolKey);

  it('reads a damaged declaration header through annotations, modifiers, generics and receivers', async () => {
    const { declarations } = await run(
      [
        'package p',
        '@Deprecated("x") @a.b.Marker(1) @[A B] @Gen<Int> public fun <T> List<T>.ext(): Int { %% }',
        'fun interface Handler { %% }',
        'typealias Alias = %%',
        'val <T> T.prop: Int get() = %%',
        'var byDel by lazy { %% }',
        'val (a, b) = %%',
        'object Obj { %% }',
        'class `Quoted` { %% }',
        'class Last',
        '',
      ].join('\n'),
    );
    const keys = keysOf(declarations);
    expect(keys).toEqual(
      expect.arrayContaining(['p.ext', 'p.Handler', 'p.Handler+*', 'p.Alias', 'p.prop', 'p.byDel', 'p.Obj', 'p.Obj+*', 'p.Quoted', 'p.Last', 'p.XKt']),
    );
    expect(keys).not.toContain('p.a');
    expect(keys).not.toContain('p.*'); // every damaged header was readable
  });

  it('an unreadable header fails the package closed: function-type receiver, name on the next line, junk', async () => {
    for (const line of ['fun ((Int) -> Unit).weird() { %% }', 'val\n  split = %%', '%% junk', 'val x.%%']) {
      const { declarations } = await run(`package p\n${line}\nclass After\n`);
      expect(keysOf(declarations), line).toContain('p.*');
      expect(keysOf(declarations), line).toContain('p.After');
    }
  });

  it('lexes comments, char literals, escapes, templates and raw strings without mis-splitting declarations', async () => {
    const { declarations } = await run(
      [
        'package p',
        '// line comment {',
        '/* block /* nested { */ still */',
        "val c = '{'",
        "val e = '\\''",
        'val s = "a\\"b ${ "inner {" } $x"',
        'val r = """raw ${ """x""" } """"',
        'val m = $$"""{ $${ "q" } }"""',
        'val d = 1 + $',
        'class After { fun f() = 1 }',
        'public %% class Broken',
        '',
      ].join('\n'),
    );
    const keys = keysOf(declarations);
    expect(keys).toEqual(expect.arrayContaining(['p.c', 'p.e', 'p.s', 'p.r', 'p.m', 'p.After', 'p.After+f', 'p.*']));
    expect(keys).not.toContain('p.Broken');
  });

  it('a literal or comment that runs off the end makes the split untrustworthy → package incomplete', async () => {
    for (const tail of ['@Anno(( %%', 'val s = "open', '/* open', 'val t = """open', 'val u = "${ open', 'fun g() {']) {
      const { declarations } = await run(`package p\nclass A { %% }\n${tail}\n`);
      expect(keysOf(declarations), tail).toContain('p.*');
    }
  });

  it('blanks only real guards and context clauses', async () => {
    const { declarations } = await run(
      [
        'package p',
        'fun a(x: Any, y: Boolean) = when (x) {',
        '    is Int if y -> 1',
        '    is Long if (if (y) true else false) -> 2',
        '    else -> 3',
        '}',
        'fun b(y: Boolean) = when {',
        '    y -> 1',
        '    else -> 2',
        '}',
        'fun c(x: Int) = when (x) { 1 -> 2; else -> 3 }',
        'private context(l: Logger)',
        'fun d() {}',
        'val f = context(1)',
        'class After',
        '',
      ].join('\n'),
    );
    expect(keysOf(declarations)).toEqual(expect.arrayContaining(['p.a', 'p.b', 'p.c', 'p.d', 'p.After']));
  });

  it('a nested class whose primary constructor sits on the next line keeps its members, its siblings and their lines', async () => {
    const { declarations, uses } = await run(
      [
        'package com.acme',
        'abstract class Reader {',
        '  class Options',
        '  private constructor(val s: List<com.acme.text.Word>) {',
        '    fun size(): Int = s.size',
        '  }',
        '  data class Pair<T>',
        '  @Inject',
        '  constructor(val a: T, val b: T)',
        '  enum class Token {',
        '    BEGIN,',
        '    END,',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    expect(keysOf(declarations)).toEqual(['com.acme.Reader', 'com.acme.Reader+Options', 'com.acme.Reader+Options+size', 'com.acme.Reader+Pair', 'com.acme.Reader+Token']);
    const lineOf = (key) => declarations.find((d) => d.symbolKey === key)?.line;
    expect([lineOf('com.acme.Reader+Options'), lineOf('com.acme.Reader+Options+size'), lineOf('com.acme.Reader+Pair'), lineOf('com.acme.Reader+Token')]).toEqual([3, 5, 7, 10]);
    expect(uses).toContainEqual(expect.objectContaining({ candidates: [{ kind: 'symbol', symbolKey: 'com.acme.text.Word' }], line: 4 }));
  });

  it('joins only a nested class header with nothing after its name, directly above its constructor', async () => {
    // At the top level the grammar reads the form as it stands; a join there would put `Top` at column 0, where the declaration splitter cuts.
    const top = await run('package p\npublic %% class Thing\nclass Top\nprivate constructor(val s: String)\n');
    expect(keysOf(top.declarations)).toEqual(expect.arrayContaining(['p.Top', 'p.*']));
    // A comment after the header, or a blank line above the constructor: no join, so the enclosing class keeps its header and a marker.
    for (const header of ['  class B // note\n', '  class B\n\n']) {
      const { declarations } = await run(`package p\nclass Box {\n${header}  private constructor(val s: String)\n}\n`);
      expect(keysOf(declarations), header).toEqual(['p.Box', 'p.Box+*']);
    }
  });

  it('never joins a header whose type parameters carry a use: a bound or an annotation would leave its row', async () => {
    for (const params of ['<T : com.acme.Bound>', '<@com.acme.Ann T>', '<T : a.B, U>']) {
      const { declarations, uses } = await run(`package p\nclass Outer {\n  class Box${params}\n  private constructor(val t: T)\n}\n`);
      expect(keysOf(declarations), params).toEqual(['p.Outer', 'p.Outer+*']);
      expect(uses.filter((u) => u.line !== 3), params).toEqual([]);
    }
    // Plain names with variance still join.
    const { declarations } = await run('package p\nclass Outer {\n  class Box<in A, out B>\n  private constructor(val a: A)\n}\n');
    expect(keysOf(declarations)).toEqual(['p.Outer', 'p.Outer+Box']);
  });

  it('joins a header to its next-line constructor in a file with CRLF line endings', async () => {
    const code = ['package com.acme', 'abstract class Reader {', '  class Options', '  private constructor(val s: List<String>) {', '    fun size(): Int = s.size', '  }', '', '  enum class Token {', '    BEGIN,', '    END,', '  }', '}', ''].join('\r\n');
    const { declarations } = await run(code);
    expect(keysOf(declarations)).toEqual(['com.acme.Reader', 'com.acme.Reader+Options', 'com.acme.Reader+Options+size', 'com.acme.Reader+Token']);
    expect(declarations.map((d) => d.line)).toEqual([2, 3, 5, 8]);
  });

  it('a nested class over a next-line constructor without val or var, which parses without an ERROR, keeps its members and their lines, LF and CRLF', async () => {
    const lines = ['package com.acme', 'class Outer {', '  class Inner', '  private constructor(s: com.acme.text.Word) {', '    class Deep', '    fun size(): Int = 1', '  }', '  class Sib', '}', ''];
    for (const eol of ['\n', '\r\n']) {
      const { declarations, uses } = await run(lines.join(eol));
      expect(declarations.map((d) => `${d.symbolKey}@${d.line}`), JSON.stringify(eol)).toEqual(['com.acme.Outer@2', 'com.acme.Outer+Inner@3', 'com.acme.Outer+Inner+Deep@5', 'com.acme.Outer+Inner+size@6', 'com.acme.Outer+Sib@8']);
      expect(uses).toContainEqual(expect.objectContaining({ candidates: [{ kind: 'symbol', symbolKey: 'com.acme.text.Word' }], line: 4 }));
    }
  });

  it('marks the top-level type of a nested class cut from its next-line constructor when no join fits', async () => {
    const cut = (header, ctor = '  constructor(s: String) {') => `package p\nclass Outer {\n${header}\n${ctor}\n    class Deep\n  }\n}\n`;
    // A comment after the header, a blank line or a comment line above the constructor, or a bound among the type parameters: Kotlin still attaches the constructor, but the join does not fit.
    for (const code of [cut('  class Inner // note'), cut('  class Inner\n'), cut('  class Inner\n  /* note */'), cut('  class Inner<T : a.B>')]) {
      expect(keysOf((await run(code)).declarations), code).toEqual(['p.Outer', 'p.Outer+Inner', 'p.Outer+*']);
    }
    // A join whose re-parse is damaged keeps the tree as it was, and the mark.
    expect(keysOf((await run('package p\nclass Outer {\n  class Inner\n  constructor(s: String) {\n    throw E()\n  }\n}\n')).declarations)).toEqual(['p.Outer', 'p.Outer+Inner', 'p.Outer+*']);
    // The mark goes to the top-level type, an object as well.
    const deeper = await run('package p\nclass Top {\n  companion object {\n    class Inner // note\n    constructor(s: String) {}\n  }\n}\nobject Solo {\n  class Inner // note\n  constructor(s: String) {}\n}\n');
    expect(keysOf(deeper.declarations)).toEqual(expect.arrayContaining(['p.Top+*', 'p.Solo+*']));
    // A class inside a function declares nothing importable, so nothing is marked.
    expect(keysOf((await run('package p\nfun f() {\n  class L {\n    class Inner // note\n    constructor(s: String) {}\n  }\n}\n')).declarations)).toEqual(['p.f', 'p.XKt']);
  });

  it('never marks a secondary constructor after a class that already ended, or after another member', async () => {
    const { declarations } = await run('package p\nclass Outer(val x: Int) {\n  class A {}\n  constructor(s: String) : this(1) {}\n  class B(val y: Int)\n  constructor(t: Long) : this(2) {}\n  class C : Base()\n  constructor(u: Char) : this(3) {}\n  val y = 1\n  constructor(v: Byte) : this(4) {}\n}\n');
    expect(keysOf(declarations)).toEqual(['p.Outer', 'p.Outer+A', 'p.Outer+B', 'p.Outer+C', 'p.Outer+y']);
  });

  it('kotlinView reads a cut class without a parser: the tree as it stands, and the mark', async () => {
    const code = 'package p\nclass Outer {\n  class Inner\n  constructor(s: String) {\n    class Deep\n  }\n}\n';
    await withParsedFiles([kt('src/a/O.kt', code)], ([f]) => {
      const bare = kotlinView(f.tree, f.content);
      expect([bare.roots.length, bare.roots[0].id === f.tree.rootNode.id, [...bare.incompleteTypes]]).toEqual([1, true, ['Outer']]);
      bare.dispose();
      const joined = kotlinView(f.tree, f.content, f.newParser);
      expect([joined.roots[0].id === f.tree.rootNode.id, [...joined.incompleteTypes]]).toEqual([false, []]);
      joined.dispose();
      joined.dispose();
    });
  });

  it('kotlinView releases its trees once, however often dispose is called', async () => {
    const code = 'package p\ncontext(l: Logger)\nfun d() {}\n';
    await withParsedFiles([kt('src/a/D.kt', code)], ([f]) => {
      const view = kotlinView(f.tree, f.content, f.newParser);
      expect(view.roots.length).toBeGreaterThan(0);
      view.dispose();
      view.dispose();
    });
  });

  it('names the facade from a qualified `kotlin.jvm.JvmName`, ignores other file annotations, and escapes a leading digit', async () => {
    await withParsedFiles(
      [
        kt('src/a/Util.kt', '@file:Suppress("x")\n@file:kotlin.jvm.JvmName("Utils")\npackage p\nfun f() {}\n'),
        kt('src/b/1util.kt', 'package p\nfun g() {}\n'),
      ],
      ([a, b]) => {
        expect(kotlinExtractor.declarations(a).map((x) => x.symbolKey)).toContain('p.Utils');
        expect(kotlinExtractor.declarations(b).map((x) => x.symbolKey)).toContain('p._1utilKt');
      },
    );
  });
});

describe('kotlin extractor — registry wiring', () => {
  it('declares the kotlin language', () => {
    expect(kotlinExtractor.languages.has('kotlin')).toBe(true);
  });
});

// The same-package candidate group: what is emitted where, and where a simple name means something else.
describe('kotlin extractor — same-package references (uses())', () => {
  const groups = async (body, pkg = 'package com.a') => {
    const { uses } = await run(`${pkg}\n${body}\n`);
    return uses.map((u) => ({ line: u.line, keys: u.candidates.map((c) => c.symbolKey), flags: u.candidates.map((c) => c.samePackage === true) }));
  };
  const keysOf = async (body, pkg) => (await groups(body, pkg)).flatMap((g) => g.keys);

  it('gives one group per name and line, marked samePackage', async () => {
    expect(await groups('class T { val a: Owner = Owner(); val b: Owner? = null }')).toEqual([{ line: 2, keys: ['com.a.Owner'], flags: [true] }]);
  });

  it('reads every type position and a capitalised receiver or callee', async () => {
    const keys = await keysOf([
      '@Mark',
      'class T<U : Bound>(val p: Param) : Base<Arg>(), Face {',
      '  val f: Field? = null',
      '  fun m(a: Arg2): Ret {',
      '    val c = Cast::class',
      '    val d = x as Casted',
      '    if (x is Test) {}',
      '    val e = Callee(1)',
      '    Recv.call()',
      '    Recv2.CONST.x()',
      '    return Maker.make()',
      '  }',
      '}',
      'typealias TA = Target',
      'fun Ext.go() {}',
    ].join('\n'));
    for (const n of ['Mark', 'Bound', 'Param', 'Base', 'Arg', 'Face', 'Field', 'Arg2', 'Ret', 'Cast', 'Casted', 'Test', 'Callee', 'Recv', 'Recv2', 'Maker', 'Target', 'Ext']) {
      expect(keys).toContain(`com.a.${n}`);
    }
  });

  it('gives nothing in the root package or for a file whose declarations could not all be read', async () => {
    expect(await keysOf('class T { val a: Owner? = null }', '')).toEqual([]);
    // The shipped grammar cuts a generic function out of a one-line class body: the file reports an unreadable type, so any declaration it holds could shadow a name, and no group is given.
    expect(await keysOf('class Box { fun <Item> a(i: Item) {} val b: Item? = null }\nclass U(val o: Owner)')).toEqual([]);
  });

  it('gives nothing for a type parameter in scope, but binds it outside that scope', async () => {
    expect(await keysOf('class Box<Owner>(val v: Owner) {\n  fun <Item> get(i: Item): Item = i\n}')).toEqual([]);
    expect(await keysOf('class Box {\n  fun <Item> a(i: Item) {}\n  val b: Item? = null\n}')).toEqual(['com.a.Item']);
  });

  it('gives nothing for a declaration of the file, or an import of that name; an alias frees the original name', async () => {
    expect(await keysOf('class T { class Owner; val o: Owner? = null }')).toEqual([]);
    expect(await keysOf('fun Owner() = 1\nval x = Owner()')).toEqual([]);
    expect(await keysOf('import x.Owner\nclass T { val o: Owner? = null }')).toEqual(['x.Owner']);
    expect(await keysOf('import x.Owner as Own\nclass T(val a: Own, val b: Owner)')).toEqual(['x.Owner', 'com.a.Owner']);
    expect(await keysOf('import x.Other\nclass T(val o: Owner)')).toEqual(['x.Other', 'com.a.Owner']);
  });

  it('offers the nested classes of an enclosing declaration\'s supertypes before the package', async () => {
    const g = await groups('import y.Imp\nclass T : Base(), Imp, ext.Q {\n  inner class In : Deep() {\n    val o: Owner? = null\n  }\n  val p: Owner? = null\n}');
    const ownerGroups = g.filter((x) => x.keys.includes('com.a.Owner'));
    expect(ownerGroups).toEqual([
      { line: 5, keys: ['com.a.Deep+Owner', 'com.a.Base+Owner', 'y.Imp+Owner', 'ext.Q+Owner', 'com.a.Owner'], flags: [true, true, false, false, true] },
      { line: 7, keys: ['com.a.Base+Owner', 'y.Imp+Owner', 'ext.Q+Owner', 'com.a.Owner'], flags: [true, false, false, true] },
    ]);
    const a = await groups('import z.*\nclass T {\n  val o = object : Anon() {\n    val x: Owner? = null\n  }\n}');
    expect(a.find((x) => x.keys.includes('com.a.Owner'))?.keys).toEqual(['com.a.Anon+Owner', 'z.Anon+Owner', 'com.a.Owner']);
    // The supertype list itself is not inside the body.
    expect((await groups('class T : Owner()')).map((x) => x.keys)).toContainEqual(['com.a.Owner']);
  });

  it('silences a capitalised receiver or callee that a variable of the file obscures', async () => {
    const bodies = [
      'fun m(Owner: String) = Owner.length',
      'fun m() { val Owner = 1; Owner.toString() }',
      'val Owner = 1\nfun m() = Owner.toString()',
      'fun m(l: List<String>) { for (Owner in l) { Owner.length } }',
      'fun m() { try {} catch (Owner: Exception) { Owner.message } }',
      'val f = { Owner: Int -> Owner.toString() }',
      'val g = { Owner, b -> Owner.go() }',
      'fun m(p: Pair<Int, Int>) { val (Owner, b) = p; Owner.toString() }',
      'class T(val Owner: String) { fun m() = Owner.length }',
      'enum class E { Owner; fun m() = Owner.name }',
    ];
    for (const body of bodies) expect((await keysOf(body)).filter((k) => k === 'com.a.Owner'), body).toEqual([]);
    // A variable obscures a type only in an expression: the type position keeps its binding.
    expect(await keysOf('class T(val Owner: Owner)')).toEqual(['com.a.Owner']);
  });

  it('reads the leftmost simple name of a qualified type and no package segment', async () => {
    const keys = await keysOf('class T(val a: Owner.Inner, val b: java.util.Map.Entry<String, x.Y>, val c: com.app.Z)');
    expect(keys).toContain('com.a.Owner');
    for (const k of ['com.a.Inner', 'com.a.Entry', 'com.a.java', 'com.a.util', 'com.a.com', 'com.a.app', 'com.a.x', 'com.a.Y', 'com.a.Z']) expect(keys).not.toContain(k);
  });

  it('does not read a lowercase callee, a this-label or a member after a dot', async () => {
    expect(await keysOf('class T {\n  fun m(o: Other) {\n    lower()\n    o.Member()\n    this@T.go()\n  }\n}')).toEqual(['com.a.Other']);
  });
});
