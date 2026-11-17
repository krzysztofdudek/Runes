/**
 * Resolve a Ruby `require_relative` literal path to a repo-relative POSIX source file,
 * or undefined. A plain `require` is resolved on the load path instead (`resolveRubyRequire`).
 *
 * The specifier is the bare string literal as written in the source
 * (`'../services/order_service'`, `'./helper'`, `'sibling'`). `require_relative`
 * always resolves RELATIVE TO THE DIRECTORY of the requiring file (never the load
 * path), so we join the literal onto `dirname(fromFile)`, append `.rb` if the literal
 * has no extension, and POSIX-normalize `..`/`.`. A candidate that escapes the repo
 * root, or that does not exist, yields undefined.
 *
 * `exists(repoRelPosix)` reports whether a candidate file exists in the resolution
 * universe (disk at --approve time; a fixed known-set in unit tests). PURE except
 * through `exists`. No directory listing, no ownership lookup — the owner index downstream
 * maps the resolved file to an owner; an unmapped resolved file is simply not a known
 * target (a coverage matter, never a violation).
 *
 * RESOLUTION MISS → undefined. This fail-to-silence is the false-positive guard: a
 * mis-typed path, or a file not present, resolves to nothing and is never flagged.
 *
 * NOTE: Ruby's constant references (superclass, mixin, qualified call, bare constant)
 * carry NO path — they resolve through the shared SymbolTable, never here. Only the
 * `require_relative` PATH hint reaches this resolver.
 */
export declare function resolveRubyRequireRelative(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean): string | undefined;
/**
 * Resolve a plain Ruby `require '<lit>'` against the repository's load path, or undefined. `require` searches `$LOAD_PATH`, never the requiring file's directory, so the literal (`.rb` appended when it names no extension) is looked up under each of `roots`, the repository's load-path roots (`lib/` and the `require_paths` of every gemspec, see {@link gemspecRequirePaths}). Exactly one existing file that `isExcluded` keeps binds; none, or two or more (two gems of the repository that both hold `lib/x/y.rb`, whose order on the load path the repository does not tell), bind nothing. A literal that is absolute, empty or climbs out of its root binds nothing either.
 */
export declare function resolveRubyRequire(specifier: string, exists: (repoRelPosix: string) => boolean, roots: readonly string[], isExcluded?: (repoRelPosix: string) => boolean): string | undefined;
/** Why a plain `require` bound no file, asked only after {@link resolveRubyRequire} answered undefined for the same arguments: `{ split }` with the files, sorted, when two or more roots hold it; `unfollowed` when the only file that holds it is one the caller excludes; else `outside` (a gem, the standard library, a native extension). */
export declare function explainRubyRequireMiss(specifier: string, exists: (repoRelPosix: string) => boolean, roots: readonly string[], isExcluded?: (repoRelPosix: string) => boolean): 'outside' | 'unfollowed' | {
    split: string[];
};
/**
 * The `require_paths` a gemspec's text sets, as written (`spec.require_paths = ["lib", "ext"]`, `%w[lib ext]`, or the singular `spec.require_path = "lib"`), or `['lib']`, RubyGems' default, when it sets none this reader can read. Only string literals are read; a computed value is not evaluated.
 */
export declare function gemspecRequirePaths(text: string): string[];
/** Why a `require_relative` bound no file, asked only after {@link resolveRubyRequireRelative} answered undefined for the same arguments: `outside` when its path climbs past the repository root, else `unfollowed` (it names a file of the repository that is not there). */
export declare function explainRubyRequireRelativeMiss(specifier: string, fromFile: string): 'outside' | 'unfollowed';
/** True when a Ruby constant key is rooted at one of Ruby's core classes or modules, which no repository declares (a reopening is not a definition). */
export declare function isRubyCoreConstant(symbolKey: string): boolean;
/** True when a Ruby constant key (`A::B::C`, leading `::` already stripped) is rooted at a
 *  constant that is always external (see RUBY_EXTERNAL_ROOTS). */
export declare function isRubyExternalConstant(symbolKey: string): boolean;
/** ActiveSupport's `underscore` for one constant segment (`HTMLParser` → `html_parser`,
 *  `ApiV1` → `api_v1`): the file/directory name Zeitwerk expects for it. */
export declare function rubyUnderscore(segment: string): string;
