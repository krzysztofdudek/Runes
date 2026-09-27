/**
 * Resolve a Python module specifier to a repo-relative POSIX source file, or undefined.
 *
 * The specifier is what the extractor emits: either an ABSOLUTE dotted module path
 * (`foo.bar`, no leading dot) or a RELATIVE one (a leading run of dots, then an
 * optional dotted tail — `.`, `..`, `.sib`, `..pkg.mod`).
 *
 * `exists(repoRelPosix)` reports whether a candidate file exists in the resolution
 * universe (disk at --approve time; a fixed known-set in unit tests). PURE except
 * through `exists` and `isExcluded`. Resolution is a pure file-existence search — no
 * directory listing, no ownership lookup. The owner index downstream maps the resolved
 * file to an owner; an unmapped resolved file is simply not a known target.
 *
 * `isExcluded`, when supplied, makes an excluded candidate act as though it does not
 * exist, in BOTH resolvers. In the absolute resolver this happens at two levels: per
 * ancestor source root, the priority list (a package, then a same-named module-as-file
 * — CPython's own precedence) no longer stops at the first EXISTING candidate — an
 * excluded one is skipped so a live candidate further down the SAME root's list (a
 * module-as-file surviving its own excluded same-named package) still reaches the
 * per-root match; and across roots, an excluded root's match is dropped from the
 * ambiguity count before deciding whether a dotted module resolved to one file or
 * several — the search probes every ancestor source root and treats 2+ DISTINCT live
 * matches as genuinely ambiguous (ANOTHER root or a same-named shadow really might be
 * the target, so a static tool must not guess which), while a single live match is
 * unambiguous even when a second, now-excluded match also exists. The relative
 * resolver has no cross-root ambiguity to decide — only the same per-root priority
 * list — so it applies the same "skip an excluded hit, try the next candidate" rule
 * to that one list. Either way an excluded file is told by the caller to not exist for this
 * purpose: it can never BE the real target, so its match must not keep a real,
 * surviving candidate silenced merely because it once shared a name or a dotted
 * module with a file the caller no longer considers. This mirrors the Go/Java package
 * resolvers' drop-then-decide rule. Absent → no candidate is ever dropped (today's
 * behavior, unaffected).
 *
 * RESOLUTION MISS → undefined. This fail-to-silence is the single most important
 * false-positive guard: a stdlib/third-party module, a mis-climbed relative import,
 * or any module whose file is not present resolves to nothing and is never flagged.
 */
export declare function resolvePythonModule(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, isExcluded?: (repoRelPosix: string) => boolean, projectRoots?: () => readonly string[]): string | undefined;
