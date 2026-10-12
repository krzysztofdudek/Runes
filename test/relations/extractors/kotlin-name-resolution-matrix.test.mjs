// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
import { kotlinExtractor } from '../../helpers/internal/relations.mjs';
import { SymbolTable } from '@chrisdudek/runes/relations';
import { makeResolver } from '@chrisdudek/runes/relations';
import { withParsedFile } from '../../helpers/tree-sitter.mjs';

/**
 * KOTLIN NAME-RESOLUTION IDENTIFICATION MATRIX — one runCase-backed test per
 * identification case. Every case is backed by a reference-catalogue doc
 * (reference/relations/kotlin/<id>.md): the embedded fixture code + the documented
 * `## Expect` outcome are the single source of truth, asserted end-to-end through the
 * REAL relation pass (extractor + resolver) by runCase. The two relations aspects
 * (reference/relations/case-has-test + case-is-tested) enforce the 1:1 catalogue↔test
 * correspondence, so this file cannot drift from the catalogue.
 *
 * THE GOVERNING DECISION (.plans/2026-06-14-import-only-languages-decision.md, amended by the same-package binding of 1.1.0): a dependency edge is established by an `import`, whose operand is a fully-qualified symbol resolved through the shared SymbolTable, by an inline fully-qualified type, and — since 1.1.0 — by a bare simple name of a type of the file's OWN package, bound only where the precedence (explicit import > same package > star import > default imports) leaves it unshadowed. Wildcard-expansion and the resolution of a bare name through a star import or the default imports stay FORBIDDEN: they would reintroduce the stdlib-collision trap (a project `Result`/`Pair`/`List` of another package colliding with an invisible stdlib name). The cardinal invariant — no false positive the shadowing rules can exclude — outranks recall; a missed edge is a tolerated false-NEGATIVE. A star import is still an import: it names a package, and is collapsed by owner exactly like Java's on-demand import (one owning node → one edge), never expanded into per-name bindings.
 *
 * The catalogue covers the full research enumeration (.plans/2026-06-15-kotlin-name-resolution-
 * research.md): import forms (A1/A3/A4/A5/A6/A7/A8/A9), implicit stdlib (B1), nested/JVM
 * keying (C1/C2), every usage-site recall gap (D1–D18), and the newer 2.0→2.4 forms
 * (E5 context parameters, E6 context-sensitive resolution, E7 nested type aliases, E8
 * use-site-target keywords). Each case asserts the SPEC-CORRECT, zero-FP outcome (an edge to
 * the right node, or silence); for every resolving form the same-name FP-trap variant sits in
 * the case's `## Files` + `## Expect`.
 */

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — import forms that resolve (FQN edge; binds the EXACT FQN, never a sibling same-name)', () => {
  it('kotlin-plain-import-fqn-edge', () => runCase('kotlin-plain-import-fqn-edge'));
  it('kotlin-plain-import-sibling-same-name-trap', () => runCase('kotlin-plain-import-sibling-same-name-trap'));
  it('kotlin-multi-import-one-edge-each', () => runCase('kotlin-multi-import-one-edge-each'));
  it('kotlin-package-header-keying-edge', () => runCase('kotlin-package-header-keying-edge'));
  it('kotlin-root-package-bare-keys-edge', () => runCase('kotlin-root-package-bare-keys-edge'));
  it('kotlin-top-level-fun-import-exact-fqn', () => runCase('kotlin-top-level-fun-import-exact-fqn'));
  it('kotlin-top-level-fun-sibling-same-name-trap', () => runCase('kotlin-top-level-fun-sibling-same-name-trap'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — alias import (`import a.b.C as D`): target is the FQN before `as`; `D` is never a key)', () => {
  it('kotlin-alias-import-fqn-before-as', () => runCase('kotlin-alias-import-fqn-before-as'));
  it('kotlin-alias-import-name-not-a-target', () => runCase('kotlin-alias-import-name-not-a-target'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — enum / companion / object member imports (resolve at the declared-TYPE boundary, else SILENCE)', () => {
  it('kotlin-enum-member-import-verbatim-silence', () => runCase('kotlin-enum-member-import-verbatim-silence'));
  it('kotlin-enum-entry-import-not-indexed-silence', () => runCase('kotlin-enum-entry-import-not-indexed-silence'));
  it('kotlin-member-chain-not-subpackage-silence', () => runCase('kotlin-member-chain-not-subpackage-silence'));
  it('kotlin-companion-member-import-plus-split', () => runCase('kotlin-companion-member-import-plus-split'));
  it('kotlin-object-member-import-plus-split', () => runCase('kotlin-object-member-import-plus-split'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — star import (`import a.b.*`): package owner-set collapse, like Java (one owner → edge; 0 or 2+ → SILENCE; never expanded)', () => {
  it('kotlin-wildcard-one-owner-edge', () => runCase('kotlin-wildcard-one-owner-edge'));
  it('kotlin-wildcard-split-owner-silence', () => runCase('kotlin-wildcard-split-owner-silence'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — default / implicit stdlib (Form 3): unimported names → SILENCE (the collision trap)', () => {
  it('kotlin-implicit-stdlib-no-import-silence', () => runCase('kotlin-implicit-stdlib-no-import-silence'));
  it('kotlin-stdlib-collision-project-result-silence', () => runCase('kotlin-stdlib-collision-project-result-silence'));
  it('kotlin-explicit-stdlib-import-absent-silence', () => runCase('kotlin-explicit-stdlib-import-absent-silence'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — nested / inner types (Form 4): split at a declared-TYPE boundary, NEVER deeper packages', () => {
  it('kotlin-nested-flat-key-fp-sealed', () => runCase('kotlin-nested-flat-key-fp-sealed'));
  it('kotlin-nested-import-plus-split-edge', () => runCase('kotlin-nested-import-plus-split-edge'));
  it('kotlin-deep-nested-import-plus-split-edge', () => runCase('kotlin-deep-nested-import-plus-split-edge'));
  it('kotlin-nested-vs-subpackage-ambiguous-silence', () => runCase('kotlin-nested-vs-subpackage-ambiguous-silence'));
  it('kotlin-nested-plus-key-not-dollar-edge', () => runCase('kotlin-nested-plus-key-not-dollar-edge'));
});

// ─────────────────────────────────────────────────────────────────────────────
// INLINE FULLY-QUALIFIED TYPE references (no import). A multi-segment user_type written
// inline in a TYPE position — parameter/return/property type, supertype list, is/as type,
// generic argument, type-alias RHS, extension-receiver type, annotation class — is
// SHADOW-FREE: a fully-qualified name has exactly one meaning, so it resolves through the
// shared SymbolTable EXACTLY like an import and produces a real cross-node edge. Each case
// puts the referenced type IN-GRAPH and asserts the edge to its node.
describe('MATRIX — inline fully-qualified TYPE reference (no import): the FQN is shadow-free → real edge', () => {
  it('kotlin-supertype-list-edge', () => runCase('kotlin-supertype-list-edge'));
  it('kotlin-generic-argument-where-edge', () => runCase('kotlin-generic-argument-where-edge'));
  it('kotlin-is-as-test-cast-edge', () => runCase('kotlin-is-as-test-cast-edge'));
  it('kotlin-param-return-property-edge', () => runCase('kotlin-param-return-property-edge'));
  it('kotlin-annotation-use-edge', () => runCase('kotlin-annotation-use-edge'));
  it('kotlin-annotation-use-site-target-edge', () => runCase('kotlin-annotation-use-site-target-edge'));
  it('kotlin-context-sensitive-resolution-edge', () => runCase('kotlin-context-sensitive-resolution-edge'));
  it('kotlin-typealias-rhs-edge', () => runCase('kotlin-typealias-rhs-edge'));
  it('kotlin-extension-receiver-edge', () => runCase('kotlin-extension-receiver-edge'));
  it('kotlin-delegation-by-edge', () => runCase('kotlin-delegation-by-edge'));
  it('kotlin-when-subject-smartcast-edge', () => runCase('kotlin-when-subject-smartcast-edge'));
  it('kotlin-pair-to-tuple-edge', () => runCase('kotlin-pair-to-tuple-edge'));
  it('kotlin-nullable-array-vararg-edge', () => runCase('kotlin-nullable-array-vararg-edge'));
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESSION-POSITION / grammar-limited SILENCES (deliberate tolerated false-NEGATIVE:
// SILENT, not a bug). The inline-FQN edge above fires ONLY in TYPE position. A reference in
// EXPRESSION position — a constructor call `com.x.Y()`, a `::class` literal, a `::member`
// callable reference — parses as a navigation_expression / member-access chain that is
// syntactically indistinguishable from `localVariable.field.method`, so binding it could pick
// the wrong target; it is DELIBERATELY left silent (zero-FP boundary). (A type inside a
// `context(...)` clause is also silent — the parse-recovery block below pins it.) The bare
// top-level call documents the same expression-position
// silence: only its IMPORT is the edge, the bare call adds nothing.
describe('MATRIX — expression-position / grammar-limited silences (deliberate tolerated false-NEGATIVE: SILENT, not a bug)', () => {
  it('kotlin-class-literal-callable-ref-usage-silence', () => runCase('kotlin-class-literal-callable-ref-usage-silence'));
  it('kotlin-constructor-call-usage-silence', () => runCase('kotlin-constructor-call-usage-silence'));
  it('kotlin-fully-qualified-inline-ref-usage-silence', () => runCase('kotlin-fully-qualified-inline-ref-usage-silence'));
  it('kotlin-bare-top-level-call-only-import-edge', () => runCase('kotlin-bare-top-level-call-only-import-edge'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — JVM artifacts (Form 8): a Kotlin import binds the Kotlin FQN, never the `<File>Kt` / `@file:JvmName` facade', () => {
  it('kotlin-jvmname-no-facade-key-edge', () => runCase('kotlin-jvmname-no-facade-key-edge'));
  it('kotlin-multiple-top-level-decls-one-key-each', () => runCase('kotlin-multiple-top-level-decls-one-key-each'));
});

// ─────────────────────────────────────────────────────────────────────────────
// NEWER-VERSION forms (Kotlin 2.0→2.4) the 2026-06-15 research audit found MISSING. The
// context-parameter forms live in the parse-recovery block below. The context-sensitive-resolution and use-site-target cases
// now EDGE on their inline fully-qualified TYPE reference (they live in the inline-FQN block
// above). What remains here is the nested type alias — a declaration-keying EDGE the existing
// enclosing-type-chain logic already handles (pinned here).
describe('MATRIX — newer forms (Kotlin 2.0→2.4): nested type alias declaration-keying edge', () => {
  it('kotlin-nested-type-alias-plus-keyed', () => runCase('kotlin-nested-type-alias-plus-keyed'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Syntax the shipped grammar does not know (Kotlin 2.2+ when-guards, multi-dollar strings,
// context parameters) turned the rest of the file into one ERROR node. The extractor blanks
// the known forms and re-parses, then re-parses what still fails one top-level declaration at
// a time; an unreadable declaration makes the file fail closed for its package.
describe('MATRIX — parse recovery: declarations after unknown syntax survive; a parse gap never flips an ambiguity', () => {
  it('kotlin-when-guard-subsequent-decls-edge', () => runCase('kotlin-when-guard-subsequent-decls-edge'));
  it('kotlin-multidollar-subsequent-decls-edge', () => runCase('kotlin-multidollar-subsequent-decls-edge'));
  it('kotlin-context-parameter-subsequent-decls-edge', () => runCase('kotlin-context-parameter-subsequent-decls-edge'));
  it('kotlin-error-decl-no-ambiguity-flip-silence', () => runCase('kotlin-error-decl-no-ambiguity-flip-silence'));
  it('kotlin-unrecoverable-decl-fails-closed-silence', () => runCase('kotlin-unrecoverable-decl-fails-closed-silence'));
  it('kotlin-annotated-annotation-class-edge', () => runCase('kotlin-annotated-annotation-class-edge'));
  it('kotlin-annotated-const-val-edge', () => runCase('kotlin-annotated-const-val-edge'));
  it('kotlin-nested-class-next-line-constructor-edge', () => runCase('kotlin-nested-class-next-line-constructor-edge'));
  it('kotlin-nested-class-next-line-constructor-no-val-edge', () => runCase('kotlin-nested-class-next-line-constructor-no-val-edge'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — keying and source layout: locals are not keys; KMP source sets', () => {
  it('kotlin-local-val-not-a-top-level-key', () => runCase('kotlin-local-val-not-a-top-level-key'));
  it('kotlin-kmp-source-set-import-edge', () => runCase('kotlin-kmp-source-set-import-edge'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SAME-PACKAGE references: a declaration of the file's own package is in scope by its simple name in every file of the package, after an explicit import and before a star import and the default imports. The shadowing rules (type parameter, declaration of the file, explicit import or alias, variable) keep it from binding where the name means something else, and the source-set rule keeps main code from seeing test classes. Owners are named in the fence (`owner=`) where two source roots of one package are two owners.
describe('MATRIX — same-package references without an import', () => {
  it('kotlin-same-package-cross-node-edge', () => runCase('kotlin-same-package-cross-node-edge'));
  it('kotlin-same-package-test-to-main-edge', () => runCase('kotlin-same-package-test-to-main-edge'));
  it('kotlin-same-package-main-never-sees-test-silence', () => runCase('kotlin-same-package-main-never-sees-test-silence'));
  it('kotlin-same-package-explicit-import-wins-edge', () => runCase('kotlin-same-package-explicit-import-wins-edge'));
  it('kotlin-same-package-beats-star-import-edge', () => runCase('kotlin-same-package-beats-star-import-edge'));
  it('kotlin-same-package-type-parameter-silence', () => runCase('kotlin-same-package-type-parameter-silence'));
  it('kotlin-same-package-declared-type-shadow-silence', () => runCase('kotlin-same-package-declared-type-shadow-silence'));
  it('kotlin-same-package-inherited-member-type-edge', () => runCase('kotlin-same-package-inherited-member-type-edge'));
  it('kotlin-same-package-external-supertype-member-trap', () => runCase('kotlin-same-package-external-supertype-member-trap'));
  it('kotlin-same-package-variable-obscures-silence', () => runCase('kotlin-same-package-variable-obscures-silence'));
  it('kotlin-same-package-split-owners-silence', () => runCase('kotlin-same-package-split-owners-silence'));
  it('kotlin-same-package-java-class-edge', () => runCase('kotlin-same-package-java-class-edge'));
  it('kotlin-same-package-root-package-silence', () => runCase('kotlin-same-package-root-package-silence'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — one JVM namespace: Kotlin imports Java declarations', () => {
  it('kotlin-imports-java-class-edge', () => runCase('kotlin-imports-java-class-edge'));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('MATRIX — ambiguity collapses to SILENCE (never an arbitrary edge)', () => {
  it('kotlin-same-fqn-two-files-ambiguous-silence', () => runCase('kotlin-same-fqn-two-files-ambiguous-silence'));
  // B4: ambiguity is counted by owner node — several defining files of ONE node are one target.
  it('kotlin-expect-actual-same-node-edge', () => runCase('kotlin-expect-actual-same-node-edge'));
  it('kotlin-toplevel-overload-multi-file-edge', () => runCase('kotlin-toplevel-overload-multi-file-edge'));

  // Resolver-level case that the runCase harness cannot express: the harness maps EVERY
  // embedded file to its parent-directory node, so a declared-but-UNMAPPED in-graph file
  // (ownerOf → undefined → `absent`) is unreachable here. The form — "a resolved FQN whose
  // file has no owning node is a coverage matter, never a relation violation → absent →
  // silence" — is verified generically at the resolver level (resolver.test.ts: "a UNIQUE but
  // UNMAPPED definition is `absent`"). Kept as a direct extractor+resolver assertion (no
  // catalogue .md) so the Kotlin-specific path is still pinned and nothing is dropped.
  it('UNMAPPED in-graph file → absent (coverage matter, never a violation; not expressible in runCase)', async () => {
    const code = 'package com.acme\nclass Order\n';
    // The declarations are plain data — the WASM tree lives only inside this call.
    const decls = await withParsedFile('src/a/Order.kt', code, (tree) =>
      kotlinExtractor.declarations({ path: 'src/a/Order.kt', content: code, tree, language: 'kotlin' }),
    );
    const st = new SymbolTable();
    for (const d of decls) st.declare('kotlin', d.symbolKey, 'src/a/Order.kt');
    // ownerOf returns undefined → the mapped file has no owning node → absent (silence).
    const r = makeResolver({
      ownerIndex: { ownerOf: () => undefined },
      symbolTable: st,
      resolvePathToFile: () => undefined,
    });
    expect(r.classify({ kind: 'symbol', symbolKey: 'com.acme.Order' }, 'src/c/Use.kt', 'kotlin')).toEqual({ kind: 'absent' });
  });
});
