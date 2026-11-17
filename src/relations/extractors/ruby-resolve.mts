import path from 'node:path';

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
export function resolveRubyRequireRelative(
  specifier: string,
  fromFile: string,
  exists: (repoRelPosix: string) => boolean,
): string | undefined {
  if (specifier === '') return undefined;

  const fromDir = path.posix.dirname(toPosix(fromFile));
  // Ruby require_relative appends `.rb` automatically; honor an explicit `.rb` too.
  const withExt = /\.rb$/.test(specifier) ? specifier : `${specifier}.rb`;

  const joined = path.posix.join(fromDir, withExt);
  const normalized = path.posix.normalize(joined);
  if (normalized.startsWith('..')) return undefined; // escaped the repo root → miss

  return exists(normalized) ? normalized : undefined;
}

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
export function resolveRubyRequire(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, load: RubyLoadPath): string | undefined {
  const hits = rubyRequireHits(specifier, fromFile, exists, load);
  return hits.live.length === 1 ? hits.live[0] : undefined;
}

/** Why a plain `require` bound no file, asked only after {@link resolveRubyRequire} answered undefined for the same arguments: `{ split }` with the files, sorted, when two or more roots hold it; `unfollowed` when the repository holds the file but the readers cannot know it is on the load path (only an excluded file holds it; a `./` path the repository root holds; a name under the root, a `lib/`, `spec/` or `test/` directory or the requiring file's own directory, outside the roots the requiring file has); else `outside` (a gem, the standard library, a native extension). */
export function explainRubyRequireMiss(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, load: RubyLoadPath): 'outside' | 'unfollowed' | { split: string[] } {
  const hits = rubyRequireHits(specifier, fromFile, exists, load);
  if (hits.live.length >= 2) return { split: [...hits.live].sort() };
  if (hits.held > 0) return 'unfollowed';
  const name = requireName(specifier);
  if (name === undefined) return 'outside';
  const places = isRelativeRequire(name) ? [''] : ['', ...load.probeDirs(), path.posix.dirname(toPosix(fromFile))];
  return places.some((dir) => { const f = underRoot(dir === '.' ? '' : dir, name); return f !== undefined && exists(f); }) ? 'unfollowed' : 'outside';
}

function rubyRequireHits(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, load: RubyLoadPath): { live: string[]; held: number } {
  const live: string[] = [];
  let held = 0;
  const name = requireName(specifier);
  if (name === undefined) return { live, held };
  const look = (candidate: string | undefined): void => {
    if (candidate === undefined || !exists(candidate) || live.includes(candidate)) return;
    held++;
    if (load.isExcluded?.(candidate) !== true) live.push(candidate);
  };
  if (isRelativeRequire(name)) {
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(toPosix(fromFile)), name));
    look(joined === '..' || joined.startsWith('../') ? undefined : joined);
  } else {
    for (const root of load.rootsFor(fromFile)) look(underRoot(root, name));
  }
  return { live, held };
}

/** The literal of a plain `require` with `.rb` appended where it names no extension, or undefined for one that is empty or absolute. */
function requireName(specifier: string): string | undefined {
  const name = toPosix(specifier);
  if (name === '' || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return undefined;
  return /\.rb$/.test(name) ? name : `${name}.rb`;
}

function isRelativeRequire(name: string): boolean {
  return name.startsWith('./') || name.startsWith('../');
}

/** `name` under `root`, or undefined when it climbs out of it. */
function underRoot(root: string, name: string): string | undefined {
  const candidate = path.posix.normalize(root === '' ? name : `${root}/${name}`);
  if (candidate === '..' || candidate.startsWith('../')) return undefined;
  return root === '' || candidate.startsWith(`${root}/`) ? candidate : undefined;
}

/**
 * The `require_paths` a gemspec's text sets, as written (`spec.require_paths = ["lib", "ext"]`, `%w[lib ext]`, or the singular `spec.require_path = "lib"`), or `['lib']`, RubyGems' default, when it sets none this reader can read. Only string literals are read; a computed value is not evaluated.
 */
export function gemspecRequirePaths(text: string): string[] {
  const list = /\.require_paths\s*=\s*(\[[^\]]*\]|%[wW](?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|<[^>]*>))/.exec(text);
  if (list !== null) {
    const body = list[1];
    const paths = body.startsWith('%') ? body.slice(3, -1).trim().split(/\s+/).filter((p) => p !== '') : [...body.matchAll(/(["'])([^"'\n]*)\1/g)].map((m) => m[2]);
    if (paths.length > 0) return paths;
  }
  const single = /\.require_path\s*=\s*(["'])([^"'\n]+)\1/.exec(text);
  return single === null ? ['lib'] : [single[2]];
}

/** Why a `require_relative` bound no file, asked only after {@link resolveRubyRequireRelative} answered undefined for the same arguments: `outside` when its path climbs past the repository root, else `unfollowed` (it names a file of the repository that is not there). */
export function explainRubyRequireRelativeMiss(specifier: string, fromFile: string): 'outside' | 'unfollowed' {
  const withExt = /\.rb$/.test(specifier) ? specifier : `${specifier}.rb`;
  return path.posix.normalize(path.posix.join(path.posix.dirname(toPosix(fromFile)), withExt)).startsWith('..') ? 'outside' : 'unfollowed';
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Root constants that are ALWAYS external to the repository, whatever the repository
 * declares: Ruby's core classes and modules (loaded before any application code, so an
 * in-repo `class String` can only reopen them) and the namespaces of the ubiquitous
 * frameworks and tools whose monkey-patches live in application initializers and `lib/`
 * (`module ActiveRecord; class Base; …`). A reopening is not a definition, and the syntax
 * cannot tell the two apart, so a reference rooted at one of these never binds to an in-repo
 * declaration. The cost is recall inside the Rails, Rack or RSpec repositories themselves,
 * whose own constants are silenced; the gain is that no application ever gets a false edge
 * from `class ApplicationRecord < ActiveRecord::Base` or from `String` in a spec.
 *
 * Other gems' namespaces are not listed: their compact reopenings are caught by the
 * root-anchoring guard, and a nested reopening of an unlisted gem namespace remains a known
 * residual gap.
 */
const RUBY_CORE_ROOTS: ReadonlySet<string> = new Set([
  // core classes and modules
  'BasicObject', 'Object', 'Kernel', 'Module', 'Class', 'Comparable', 'Enumerable', 'Enumerator',
  'String', 'Symbol', 'Integer', 'Float', 'Numeric', 'Rational', 'Complex', 'Array', 'Hash', 'Range',
  'Regexp', 'MatchData', 'Proc', 'Method', 'UnboundMethod', 'NilClass', 'TrueClass', 'FalseClass',
  'IO', 'File', 'Dir', 'Time', 'Struct', 'Data', 'Thread', 'Fiber', 'Mutex', 'Queue', 'SizedQueue',
  'ConditionVariable', 'Process', 'Signal', 'GC', 'ObjectSpace', 'Marshal', 'Math', 'Random',
  'Encoding', 'Warning', 'Ractor', 'RubyVM', 'TracePoint', 'Binding', 'Set', 'Refinement', 'Errno',
  'ENV', 'ARGV', 'ARGF', 'STDIN', 'STDOUT', 'STDERR',
  // the core exception hierarchy
  'Exception', 'StandardError', 'RuntimeError', 'ArgumentError', 'TypeError', 'NameError',
  'NoMethodError', 'KeyError', 'IndexError', 'StopIteration', 'ClosedQueueError', 'IOError',
  'EOFError', 'SystemExit', 'NotImplementedError', 'ZeroDivisionError', 'FrozenError', 'RangeError',
  'FloatDomainError', 'ScriptError', 'LoadError', 'SyntaxError', 'SecurityError', 'SignalException',
  'Interrupt', 'SystemCallError', 'EncodingError', 'FiberError', 'ThreadError', 'LocalJumpError',
  'RegexpError', 'UncaughtThrowError', 'NoMatchingPatternError', 'NoMatchingPatternKeyError',
  'NoMemoryError', 'SystemStackError',
]);

/** The namespaces of the ubiquitous frameworks and tools, external to an application, but the repository's own inside the framework's repository (see RUBY_EXTERNAL_ROOTS). */
const RUBY_FRAMEWORK_ROOTS: ReadonlySet<string> = new Set([
  'Rails', 'ActiveRecord', 'ActiveSupport', 'ActiveModel', 'ActiveJob', 'ActiveStorage',
  'ActionController', 'ActionDispatch', 'ActionView', 'ActionMailer', 'ActionCable', 'ActionMailbox',
  'ActionText', 'Arel', 'Rack', 'RSpec', 'Minitest', 'Sinatra', 'Rake', 'Bundler', 'Gem',
]);

const RUBY_EXTERNAL_ROOTS: ReadonlySet<string> = new Set([...RUBY_CORE_ROOTS, ...RUBY_FRAMEWORK_ROOTS]);

/** True when a Ruby constant key is rooted at one of Ruby's core classes or modules, which no repository declares (a reopening is not a definition). */
export function isRubyCoreConstant(symbolKey: string): boolean {
  const idx = symbolKey.indexOf('::');
  return RUBY_CORE_ROOTS.has(idx === -1 ? symbolKey : symbolKey.slice(0, idx));
}

/** True when a Ruby constant key (`A::B::C`, leading `::` already stripped) is rooted at a
 *  constant that is always external (see RUBY_EXTERNAL_ROOTS). */
export function isRubyExternalConstant(symbolKey: string): boolean {
  const idx = symbolKey.indexOf('::');
  return RUBY_EXTERNAL_ROOTS.has(idx === -1 ? symbolKey : symbolKey.slice(0, idx));
}

/** ActiveSupport's `underscore` for one constant segment (`HTMLParser` → `html_parser`,
 *  `ApiV1` → `api_v1`): the file/directory name Zeitwerk expects for it. */
export function rubyUnderscore(segment: string): string {
  return segment
    .replace(/([A-Z\d]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
