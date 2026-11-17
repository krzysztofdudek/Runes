import path from 'node:path';
import { parseCompileCommands, type CompileDb, type IncludeRoots } from './extractors/include-resolve.mjs';
import { parseComposerAutoload, type ComposerAutoload } from './extractors/php-resolve.mjs';
import { gemspecRequirePaths, type RubyLoadPath } from './extractors/ruby-resolve.mjs';
import { joinRel, type FileSource } from './file-view.mjs';
import { reportUnreadable, strictJsonFailure, type DiagnosticSink } from './diagnostics.mjs';

/**
 * Repository-wide build-layout facts the C/C++, PHP and Ruby path resolvers need beyond the
 * importing file's own ancestors: every directory named `include` (the C/C++ probe roots),
 * every `composer.json` (the PHP autoload union), every gemspec (the Ruby load path), and the C/C++ compilation database.
 *
 * Everything is discovered LAZILY, at most once per factory instance (one resolver run),
 * and only when a resolver actually needs it: a repository without C/C++ or PHP never walks.
 * The walk skips dot-directories, `node_modules` and `vendor` (third-party trees whose
 * `composer.json` files describe installed packages, not this repository's own autoload
 * map), directories the caller excludes, and anything deeper than {@link MAX_DEPTH}; it stops
 * listing after {@link MAX_DIRS} directories so a pathological tree cannot stall a check.
 *
 * NOTE: like the other makeXResolveDeps factories this reads and lists files through the `files` source (the disk or a caller's view); it does not parse source. `projectRoot` is only the base the compilation database's absolute paths are made relative to.
 */
const MAX_DEPTH = 12;
const MAX_DIRS = 50_000;
const SKIP_DIRS = new Set(['node_modules', 'vendor']);
/** The directories a Ruby project puts on its load path by convention: `lib` (RubyGems' default), `spec` (RSpec) and `test` (Rails, Minitest's rake task). */
const RUBY_DIRS = new Set(['lib', 'spec', 'test']);
/** The directory names under which a gemspec describes a fixture, not a gem of the repository: its load path reaches only the files under it. */
const RUBY_FIXTURE_DIRS = new Set(['test', 'tests', 'spec', 'specs', 'fixture', 'fixtures']);
/** The directory names whose contents are fixtures alone: no `lib`, `spec` or `test` directory under them is a place a file of the repository is required from. */
const RUBY_FIXTURE_ONLY = new Set(['fixture', 'fixtures']);

interface Layout {
  includeDirs: string[];
  composerFiles: string[];
  gemspecFiles: string[];
  rubyDirs: string[];
}

export interface RepoLayout {
  /** C/C++ include-root capabilities for `resolveIncludePath`. */
  includeRoots: IncludeRoots;
  /** Every in-repo composer.json's autoload maps (repo-rel dirs), in walk order. */
  composerMaps(): readonly ComposerAutoload[];
  /** The Ruby load path for `resolveRubyRequire`: for a requiring file, `lib`, each `require_paths` entry of every in-repo gemspec joined to the gemspec's directory (of a gemspec under a test or fixture directory, only for files under the gemspec's own directory), and each `spec` or `test` directory the file lies in, unless it lies inside `lib/`. */
  rubyLoadPath: RubyLoadPath;
}

export function makeRepoLayout(
  projectRoot: string,
  files: FileSource,
  isExcluded?: (repoRelPosix: string) => boolean,
  report?: DiagnosticSink,
): RepoLayout {
  let layout: Layout | undefined;
  const scan = (): Layout => {
    if (layout !== undefined) return layout;
    const found: Layout = { includeDirs: [], composerFiles: [], gemspecFiles: [], rubyDirs: [] };
    const queue: Array<{ dir: string; depth: number }> = [{ dir: '', depth: 0 }];
    let visited = 0;
    while (queue.length > 0 && visited < MAX_DIRS) {
      const { dir, depth } = queue.shift()!;
      visited++;
      const entries = files.list(dir);
      if (entries === undefined) continue;
      for (const e of entries) {
        const rel = joinRel(dir, e.name);
        if (e.kind === 'dir') {
          if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
          if (isExcluded?.(rel) === true) continue;
          if (e.name === 'include') found.includeDirs.push(rel);
          if (RUBY_DIRS.has(e.name) && !rel.split('/').some((seg) => RUBY_FIXTURE_ONLY.has(seg))) found.rubyDirs.push(rel);
          if (depth + 1 <= MAX_DEPTH) queue.push({ dir: rel, depth: depth + 1 });
        } else if (e.kind === 'file' && e.name === 'composer.json') {
          if (isExcluded?.(rel) === true) continue;
          found.composerFiles.push(rel);
        } else if (e.kind === 'file' && e.name.endsWith('.gemspec')) {
          if (isExcluded?.(rel) === true) continue;
          found.gemspecFiles.push(rel);
        }
      }
    }
    layout = found;
    return layout;
  };

  // The compilation database: `compile_commands.json` at the repository root, else in
  // `build/`. The first one that parses into at least one in-repo translation unit wins.
  let db: CompileDb | null | undefined;
  const compileDb = (): CompileDb | undefined => {
    if (db !== undefined) return db ?? undefined;
    db = null;
    for (const dir of ['', 'build']) {
      const abs = path.join(projectRoot, dir, 'compile_commands.json');
      const text = files.read(joinRel(dir, 'compile_commands.json'));
      if (text === undefined) continue;
      const failure = report === undefined ? undefined : strictJsonFailure(text);
      if (report !== undefined && failure !== undefined) reportUnreadable(report, joinRel(dir, 'compile_commands.json'), failure, 'its include roots are not used');
      const parsed = parseCompileCommands(text, path.dirname(abs), path.resolve(projectRoot));
      if (parsed !== undefined) {
        db = parsed;
        break;
      }
    }
    return db ?? undefined;
  };

  let probe: string[] | undefined;
  const includeRoots: IncludeRoots = {
    compileDbRoots: (fromFile) => compileDb()?.rootsFor(fromFile),
    probeRoots: () => (probe ??= ['', ...scan().includeDirs]),
    isExcluded,
  };

  let maps: ComposerAutoload[] | undefined;
  const composerMaps = (): readonly ComposerAutoload[] => {
    if (maps !== undefined) return maps;
    maps = [];
    for (const file of scan().composerFiles) {
      const text = files.read(file);
      if (text === undefined) continue;
      const failure = report === undefined ? undefined : strictJsonFailure(text);
      if (report !== undefined && failure !== undefined) reportUnreadable(report, file, failure, 'its autoload maps are not used');
      const dir = path.posix.dirname(file);
      maps.push(parseComposerAutoload(text, dir === '.' ? '' : dir));
    }
    return maps;
  };

  let gemRoots: Array<{ root: string; scope: string | undefined }> | undefined;
  const gemspecRoots = (): Array<{ root: string; scope: string | undefined }> => {
    if (gemRoots !== undefined) return gemRoots;
    gemRoots = [];
    for (const file of scan().gemspecFiles) {
      const text = files.read(file);
      if (text === undefined) continue;
      const dir = path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file);
      const scope = dir.split('/').some((seg) => RUBY_FIXTURE_DIRS.has(seg)) ? dir : undefined;
      for (const p of gemspecRequirePaths(text)) {
        const root = path.posix.normalize(dir === '' ? p : `${dir}/${p}`).replace(/\/+$/, '');
        if (root === '..' || root.startsWith('../') || root.startsWith('/')) continue;
        gemRoots.push({ root: root === '.' ? '' : root, scope });
      }
    }
    return gemRoots;
  };
  const rubyLoadPath: RubyLoadPath = {
    rootsFor: (fromFile) => {
      const roots = new Set<string>(['lib']);
      for (const { root, scope } of gemspecRoots()) if (scope === undefined || fromFile.startsWith(`${scope}/`)) roots.add(root);
      const segs = fromFile.split('/');
      // A spec or test directory inside lib/ is part of the library's tree, which no test run puts on the load path.
      const inLib = segs.indexOf('lib');
      for (let i = 1; i < segs.length; i++) if ((segs[i - 1] === 'spec' || segs[i - 1] === 'test') && (inLib === -1 || inLib >= i - 1)) roots.add(segs.slice(0, i).join('/'));
      return [...roots];
    },
    probeDirs: () => ['', ...scan().rubyDirs],
    isExcluded,
  };

  return { includeRoots, composerMaps, rubyLoadPath };
}
