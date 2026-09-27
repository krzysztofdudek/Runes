import type { DetectedDep, ParsedFile } from './types.mjs';
/**
 * Evaluate a preprocessor controlling expression built from LITERALS ONLY. Returns the
 * integer value, or undefined when the value depends on anything a source-only tool cannot
 * know (a macro identifier, `defined(...)`, `__has_include(...)`, a function-like call, a
 * character literal, a division by zero, malformed text).
 *
 * Accepted: integer literals (decimal, hex, octal, binary, digit separators, u/l suffixes),
 * `true`/`false` (C++ [cpp.cond] keeps their boolean values; C23 keywords; `<stdbool.h>`
 * macros in older C), parentheses, unary `! ~ - +`, binary `* / % + - << >> < > <= >= ==
 * != & ^ | && ||` and `?:`. `&&`/`||` short-circuit, so `0 && FOO` is 0 and `1 || FOO` is
 * 1 even though `FOO` is unknown: the result does not depend on the macro.
 *
 * Soundness is one-sided by design: the caller treats a branch as dead only on a KNOWN
 * zero (or on a known non-zero earlier branch), so an unknown value always keeps the
 * include LIVE. Under-emission for a live conditional include cannot happen through this.
 */
export declare function evalPreprocessorCondition(expr: string): number | undefined;
/**
 * The 1-based line numbers that sit in a statically dead preprocessor group, computed from
 * the TEXT, not the tree. Used only when the tree contains an ERROR node: tree-sitter-c and
 * tree-sitter-cpp both turn `#if __has_include("x.h")` into an ERROR and flatten the rest of
 * the chain into plain siblings, so the ancestor walk above can no longer see that an
 * include sits under a following `#elif 0`.
 *
 * Comments, string literals and character literals are blanked first (newlines kept), and
 * backslash-continued directive lines are joined. The scanner tracks
 * `#if/#ifdef/#ifndef/#elif/#elifdef/#elifndef/#else/#endif` nesting with the same rules as
 * the tree walk: a known-zero group is dead, every group after a known-non-zero group is
 * dead, and an unknown condition is live. An unbalanced directive structure yields an empty
 * set (nothing is dropped), so a scan that cannot be trusted never costs an edge.
 */
export declare function deadPreprocessorLines(source: string): Set<number>;
/**
 * Emit one path hint per QUOTED `#include`, and per ANGLE `#include` (as `<name>`, which the
 * resolver looks up only under a compilation database's `-I` roots). The specifier is the
 * header name exactly as written; the resolver (`include-resolve.ts`) tries the includer's
 * directory first, then the include roots, and silences anything that is not exactly one
 * existing file. Macro includes are skipped here, so they never reach the resolver.
 *
 * An include in a statically dead preprocessor group is SKIPPED: a group whose condition is
 * a known zero (`#if 0`, `#if (0)`, `#if false`, `#elif 0`), or any later group of a chain
 * whose earlier condition is a known non-zero (`#else` of `#if 1`). When the tree has an
 * ERROR node, the text scan {@link deadPreprocessorLines} is consulted as well, because the
 * grammar can flatten a conditional chain (`#if __has_include(...)`). Every unknown condition
 * (`#ifdef`, `#if FOO`, `#if defined(...)`) is kept — those are legitimate conditional
 * dependencies.
 */
export declare function includeUses(file: ParsedFile): DetectedDep[];
