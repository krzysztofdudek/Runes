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
/** The repository's Ruby load path, as far as the repository tells it (`RepoLayout.rubyLoadPath`). */
export interface RubyLoadPath {
    /** The load-path roots a plain `require` in `fromFile` is looked up under (repo-rel dirs, '' the repository root). */
    rootsFor(fromFile: string): readonly string[];
    /** The places where a file the repository holds may be on a load path the readers cannot know: '' and every directory named `lib`, `spec` or `test`. */
    probeDirs(): readonly string[];
    /** Optional: true when the caller excludes this repo-relative POSIX path. */
    isExcluded?(repoRelPosix: string): boolean;
}
/**
 * Resolve a plain Ruby `require '<lit>'` to a repo-relative POSIX file, or undefined. `require` searches `$LOAD_PATH`, so the literal (`.rb` appended when it names no extension) is looked up under each root `load.rootsFor(fromFile)` gives: `lib/`, the `require_paths` of the repository's gemspecs, and a `spec/` or `test/` directory the requiring file lies in, which RSpec and Rails' test runs put on the load path. A literal that starts with `./` or `../` is a path, which Ruby reads from the working directory; it is read from the requiring file's directory, where a script or a rackup file run from its own directory finds it. Exactly one existing file the caller keeps binds; none, or two or more (two gems of the repository that both hold `lib/x/y.rb`, whose order on the load path the repository does not tell), bind nothing. A literal that is absolute, empty or climbs out of its root or the repository binds nothing either.
 */
export declare function resolveRubyRequire(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, load: RubyLoadPath): string | undefined;
/** Why a plain `require` bound no file, asked only after {@link resolveRubyRequire} answered undefined for the same arguments: `{ split }` with the files, sorted, when two or more roots hold it; `unfollowed` when the repository holds the file but the readers cannot know it is on the load path (only an excluded file holds it; a `./` path the repository root holds; a name under the root, a `lib/`, `spec/` or `test/` directory or the requiring file's own directory, outside the roots the requiring file has); else `outside` (a gem, the standard library, a native extension). */
export declare function explainRubyRequireMiss(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, load: RubyLoadPath): 'outside' | 'unfollowed' | {
    split: string[];
};
/**
 * The `require_paths` a gemspec's text sets, as written (`spec.require_paths = ["lib", "ext"]`, `%w[lib ext]`, or the singular `spec.require_path = "lib"`), or `['lib']`, RubyGems' default, when it sets none this reader can read. Only string literals are read; a computed value is not evaluated.
 */
export declare function gemspecRequirePaths(text: string): string[];
/** Why a `require_relative` bound no file, asked only after {@link resolveRubyRequireRelative} answered undefined for the same arguments: `outside` when its path climbs past the repository root, else `unfollowed` (it names a file of the repository that is not there). */
export declare function explainRubyRequireRelativeMiss(specifier: string, fromFile: string): 'outside' | 'unfollowed';
/** True when a Ruby constant key is rooted at the namespace of a ubiquitous framework or tool (`Rack`, `ActiveSupport`, `RSpec`), which the repository declares as its own only when it is that framework's repository. */
export declare function isRubyFrameworkConstant(symbolKey: string): boolean;
/** True when a Ruby constant key is rooted at one of Ruby's core classes or modules, which no repository declares (a reopening is not a definition). */
export declare function isRubyCoreConstant(symbolKey: string): boolean;
/** True when a Ruby constant key (`A::B::C`, leading `::` already stripped) is rooted at a
 *  constant that is always external (see RUBY_EXTERNAL_ROOTS). */
export declare function isRubyExternalConstant(symbolKey: string): boolean;
/** ActiveSupport's `underscore` for one constant segment (`HTMLParser` → `html_parser`,
 *  `ApiV1` → `api_v1`): the file/directory name Zeitwerk expects for it. */
export declare function rubyUnderscore(segment: string): string;
