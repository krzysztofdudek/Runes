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
export function resolveRubyRequireRelative(specifier, fromFile, exists) {
    if (specifier === '')
        return undefined;
    const fromDir = path.posix.dirname(toPosix(fromFile));
    // Ruby require_relative appends `.rb` automatically; honor an explicit `.rb` too.
    const withExt = /\.rb$/.test(specifier) ? specifier : `${specifier}.rb`;
    const joined = path.posix.join(fromDir, withExt);
    const normalized = path.posix.normalize(joined);
    if (normalized.startsWith('..'))
        return undefined; // escaped the repo root → miss
    return exists(normalized) ? normalized : undefined;
}
/**
 * Resolve a plain Ruby `require '<lit>'` against the repository's load path, or undefined. `require` searches `$LOAD_PATH`, never the requiring file's directory, so the literal (`.rb` appended when it names no extension) is looked up under each of `roots`, the repository's load-path roots (`lib/` and the `require_paths` of every gemspec, see {@link gemspecRequirePaths}). Exactly one existing file that `isExcluded` keeps binds; none, or two or more (two gems of the repository that both hold `lib/x/y.rb`, whose order on the load path the repository does not tell), bind nothing. A literal that is absolute, empty or climbs out of its root binds nothing either.
 */
export function resolveRubyRequire(specifier, exists, roots, isExcluded) {
    const hits = rubyRequireHits(specifier, exists, roots, isExcluded);
    return hits.live.length === 1 ? hits.live[0] : undefined;
}
/** Why a plain `require` bound no file, asked only after {@link resolveRubyRequire} answered undefined for the same arguments: `{ split }` with the files, sorted, when two or more roots hold it; `unfollowed` when the only file that holds it is one the caller excludes; else `outside` (a gem, the standard library, a native extension). */
export function explainRubyRequireMiss(specifier, exists, roots, isExcluded) {
    const hits = rubyRequireHits(specifier, exists, roots, isExcluded);
    if (hits.live.length >= 2)
        return { split: [...hits.live].sort() };
    return hits.held > 0 ? 'unfollowed' : 'outside';
}
function rubyRequireHits(specifier, exists, roots, isExcluded) {
    const name = toPosix(specifier);
    const live = [];
    let held = 0;
    if (name === '' || name.startsWith('/') || /^[A-Za-z]:/.test(name))
        return { live, held };
    const withExt = /\.rb$/.test(name) ? name : `${name}.rb`;
    for (const root of roots) {
        const candidate = path.posix.normalize(root === '' ? withExt : `${root}/${withExt}`);
        if (candidate.startsWith('../') || (root !== '' && !candidate.startsWith(`${root}/`)))
            continue;
        if (!exists(candidate))
            continue;
        held++;
        if (isExcluded?.(candidate) !== true)
            live.push(candidate);
    }
    return { live, held };
}
/**
 * The `require_paths` a gemspec's text sets, as written (`spec.require_paths = ["lib", "ext"]`, `%w[lib ext]`, or the singular `spec.require_path = "lib"`), or `['lib']`, RubyGems' default, when it sets none this reader can read. Only string literals are read; a computed value is not evaluated.
 */
export function gemspecRequirePaths(text) {
    const list = /\.require_paths\s*=\s*(\[[^\]]*\]|%[wW](?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|<[^>]*>))/.exec(text);
    if (list !== null) {
        const body = list[1];
        const paths = body.startsWith('%') ? body.slice(3, -1).trim().split(/\s+/).filter((p) => p !== '') : [...body.matchAll(/(["'])([^"'\n]*)\1/g)].map((m) => m[2]);
        if (paths.length > 0)
            return paths;
    }
    const single = /\.require_path\s*=\s*(["'])([^"'\n]+)\1/.exec(text);
    return single === null ? ['lib'] : [single[2]];
}
/** Why a `require_relative` bound no file, asked only after {@link resolveRubyRequireRelative} answered undefined for the same arguments: `outside` when its path climbs past the repository root, else `unfollowed` (it names a file of the repository that is not there). */
export function explainRubyRequireRelativeMiss(specifier, fromFile) {
    const withExt = /\.rb$/.test(specifier) ? specifier : `${specifier}.rb`;
    return path.posix.normalize(path.posix.join(path.posix.dirname(toPosix(fromFile)), withExt)).startsWith('..') ? 'outside' : 'unfollowed';
}
function toPosix(p) {
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
const RUBY_EXTERNAL_ROOTS = new Set([
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
    // ubiquitous frameworks and tools
    'Rails', 'ActiveRecord', 'ActiveSupport', 'ActiveModel', 'ActiveJob', 'ActiveStorage',
    'ActionController', 'ActionDispatch', 'ActionView', 'ActionMailer', 'ActionCable', 'ActionMailbox',
    'ActionText', 'Arel', 'Rack', 'RSpec', 'Minitest', 'Sinatra', 'Rake', 'Bundler', 'Gem',
]);
/** True when a Ruby constant key (`A::B::C`, leading `::` already stripped) is rooted at a
 *  constant that is always external (see RUBY_EXTERNAL_ROOTS). */
export function isRubyExternalConstant(symbolKey) {
    const idx = symbolKey.indexOf('::');
    return RUBY_EXTERNAL_ROOTS.has(idx === -1 ? symbolKey : symbolKey.slice(0, idx));
}
/** ActiveSupport's `underscore` for one constant segment (`HTMLParser` → `html_parser`,
 *  `ApiV1` → `api_v1`): the file/directory name Zeitwerk expects for it. */
export function rubyUnderscore(segment) {
    return segment
        .replace(/([A-Z\d]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .toLowerCase();
}
