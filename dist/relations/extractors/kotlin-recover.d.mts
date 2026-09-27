import type { Node, Parser, Tree } from 'web-tree-sitter';
/**
 * Kotlin parse recovery for the relation extractor.
 *
 * WHY: the shipped tree-sitter-kotlin grammar predates Kotlin 2.2. Three stable forms of
 * newer Kotlin — a `when` guard (`is String if s.isNotEmpty() ->`), a multi-dollar string
 * (`$$"price: $$amount"`) and a context-parameter clause (`context(log: Logger)`) — make it
 * give up: everything from the construct to the end of the file becomes ONE `ERROR` node with
 * no usable children. Every declaration after the construct then vanished from the symbol
 * table, silently. That is a missed dependency for an import of any of them, and — worse —
 * when one of those declarations was a duplicate of a key another file also declares, the
 * other file became the unique definer and an ambiguity flipped into a WRONG edge.
 *
 * WHAT: `kotlinView` turns a parsed file into the set of trustworthy parse nodes to walk, plus
 * what could only be read lexically:
 *   1. A file whose tree holds no ERROR node is used as-is (the common case, no extra work;
 *      zero-width MISSING tokens alone do not count, see `damaged`).
 *   2. Otherwise the three known forms are BLANKED — replaced by spaces, same length, so every
 *      row and column stays put — and the file is re-parsed. A clean re-parse is used as-is.
 *   3. Whatever is still damaged is split into top-level declarations by a small lexer (a
 *      declaration starts on a column-0 line at bracket depth 0) and each one is re-parsed on
 *      its own, padded so its rows and columns match the file. A clean declaration is walked
 *      like any other; a declaration that still fails contributes only the name read from its
 *      leading tokens (`class X`, `fun f`, `val v`), never the nodes of a broken parse.
 *   4. What cannot be read at all is reported as INCOMPLETE: the whole package (a declaration
 *      whose name is unreadable, or a lexer that lost track of the brackets) or one type's
 *      members (a class whose body did not parse). The extractor turns these into marker
 *      declarations the resolver uses to fail closed — see resolver.ts `incompletenessMarkers`.
 *
 * The blanking runs ONLY on a file that already failed to parse, so a wrong guess can never
 * disturb a file the grammar reads correctly; the worst it can do is leave a damaged file
 * damaged, which step 3 and 4 then handle.
 *
 * THE GRAMMAR SITUATION (why this is recovery, not a grammar fix): the shipped
 * `@tree-sitter-grammars/tree-sitter-kotlin` 1.1.0 (2025-01) is a fork that stopped moving (its
 * when-guard PR is still open). The upstream it forked from, fwcd/tree-sitter-kotlin, parses
 * when-guards and multi-dollar strings on main but has no npm release (npm `tree-sitter-kotlin`
 * is an old 0.3.x), uses different node types (37 of the Kotlin matrix and AST tests fail on
 * it), and still errors on context parameters. Choosing a fork and building it from a pinned
 * commit is a grammar-packaging decision; until then this module keeps the extractor honest on
 * the shipped grammar. When a grammar that reads these forms lands, a file it parses cleanly
 * takes the first branch below and none of this runs.
 */
/** A declaration read from a damaged declaration's leading tokens. */
export interface LexicalDecl {
    name: string;
    /** `type`: class / interface / object (may own nested members); `callable`: fun / val /
     *  var / typealias (a top-level callable owns no importable members). */
    kind: 'type' | 'callable';
    line: number;
}
export interface KotlinView {
    /** Parse nodes whose subtrees parsed without error (walkers still skip any `ERROR`). */
    roots: Node[];
    /** Top-level declarations recovered only lexically. */
    lexical: LexicalDecl[];
    /** True when some part of the file could not be read at all: the file may declare anything
     *  in its package. */
    packageIncomplete: boolean;
    /** Simple names of top-level types whose members could not all be read. */
    incompleteTypes: Set<string>;
    /** Release the WASM trees created for the recovery. Idempotent. */
    dispose(): void;
}
/**
 * The trustworthy view of a Kotlin file for relation extraction. See the file doc comment. The
 * caller MUST call `dispose()` when done (the recovery may create WASM trees).
 *
 * `newParser` makes a fresh parser of the caller's tree-sitter runtime (the one that built
 * `tree`); recovery re-parses spans of a damaged file with it. It is injected so this module
 * never imports `web-tree-sitter` by value: a second copy of the runtime would not share the
 * loaded language. A damaged file without it throws, because silently skipping recovery would
 * change which declarations the file reports.
 */
export declare function kotlinView(tree: Tree, content: string, newParser?: () => Parser): KotlinView;
