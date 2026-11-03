// The corpus gate: public repositories pinned at full commits (corpus/manifest.json), resolved through the public relation API exactly as the catalogue runner resolves a case, and held to two things. `verify` (npm run corpus:edges) compares every resolved reference with the committed golden (corpus/goldens/<id>.edges) and fails on any change that corpus/explained.md does not explain. `oracles` (npm run corpus:oracles) compares the references with the language's own resolver where one can be run: TypeScript's module resolution, Python's PathFinder, a TOML parser against the Cargo manifest reader, `go list`, `dotnet msbuild` and the C preprocessor. `gate` (npm run corpus, and the default) is the whole gate: both, over one resolution of each repository, as CI runs it. `update` (npm run corpus:update) rewrites the goldens, and refuses while a change is unexplained. Nothing here ships and nothing here runs inside npm test.
//
// Each repository is fetched by its commit alone into `${RUNES_CORPUS_DIR:-~/.cache/runes/corpus}/<id>@<commit>`, never into a checkout. The files resolution sees are the files git tracks at that commit, through a listed file view, so a stray file on disk cannot move an edge. A golden line is `<from>:<line>\t<resolved file>`, one per resolved reference (a reference that resolves to its own file is no edge), sorted by code unit. Every file is its directory's: the owner the resolver counts ambiguity by is the file's directory, as a consumer that maps one component per directory sees it.
//
// Usage: node scripts/corpus.mjs [gate|verify|update|oracles] [--only <id>[,<id>]] [--tier routine|heavy|all] [--strict] [--runes <dir>] [--manifest <file>] [--goldens <dir>] [--explained <file>] [--cache <dir>]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
// The Python the Python and Cargo oracles run; RUNES_CORPUS_PYTHON names another one.
const PYTHON = process.env.RUNES_CORPUS_PYTHON ?? 'python3';

const USAGE = 'usage: node scripts/corpus.mjs [gate|verify|update|oracles] [--only <id>[,<id>]] [--tier routine|heavy|all] [--strict] [--runes <dir>] [--manifest <file>] [--goldens <dir>] [--explained <file>] [--cache <dir>]';

/** A reported failure that ends the run with exit code 1 and a message, never a stack. */
class CorpusError extends Error {}

function parseCommandLine(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      only: { type: 'string', multiple: true },
      tier: { type: 'string' },
      strict: { type: 'boolean' },
      runes: { type: 'string' },
      manifest: { type: 'string' },
      goldens: { type: 'string' },
      explained: { type: 'string' },
      cache: { type: 'string' },
    },
  });
  const command = positionals[0] ?? 'gate';
  if (!['gate', 'verify', 'update', 'oracles'].includes(command) || positionals.length > 1) throw new CorpusError(USAGE);
  const tier = values.tier ?? 'routine';
  if (!['routine', 'heavy', 'all'].includes(tier)) throw new CorpusError(`--tier must be routine, heavy or all, not '${tier}'`);
  return {
    command,
    only: (values.only ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => v !== ''),
    tier,
    strict: values.strict === true,
    runes: path.resolve(values.runes ?? ROOT),
    manifest: path.resolve(values.manifest ?? path.join(ROOT, 'corpus', 'manifest.json')),
    goldens: path.resolve(values.goldens ?? path.join(ROOT, 'corpus', 'goldens')),
    explained: path.resolve(values.explained ?? path.join(ROOT, 'corpus', 'explained.md')),
    cache: path.resolve(values.cache ?? process.env.RUNES_CORPUS_DIR ?? path.join(os.homedir(), '.cache', 'runes', 'corpus')),
  };
}

// ---------------------------------------------------------------------------
// The manifest and the explanations

const FULL_SHA = /^[0-9a-f]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function loadManifest(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new CorpusError(`${file}: ${err.message}`);
  }
  if (data.schema !== 'runes-corpus/1' || !Array.isArray(data.repositories)) throw new CorpusError(`${file}: not a runes-corpus/1 manifest`);
  const seen = new Set();
  for (const r of data.repositories) {
    const where = `${file}: repository ${JSON.stringify(r.id)}`;
    if (typeof r.id !== 'string' || !ID.test(r.id)) throw new CorpusError(`${where}: the id must match ${ID}`);
    if (seen.has(r.id)) throw new CorpusError(`${where}: the id is listed twice`);
    seen.add(r.id);
    if (typeof r.url !== 'string' || r.url === '') throw new CorpusError(`${where}: no url`);
    if (typeof r.commit !== 'string' || !FULL_SHA.test(r.commit)) throw new CorpusError(`${where}: the commit must be a full 40-character SHA, not ${JSON.stringify(r.commit)}`);
    if (r.tier !== 'routine' && r.tier !== 'heavy') throw new CorpusError(`${where}: the tier must be routine or heavy`);
    if (r.sparse !== undefined && (!Array.isArray(r.sparse) || r.sparse.some((p) => typeof p !== 'string' || p === ''))) throw new CorpusError(`${where}: sparse must be a list of patterns`);
  }
  return data.repositories;
}

function selectRepositories(repos, opts) {
  if (opts.only.length > 0) {
    const unknown = opts.only.filter((id) => !repos.some((r) => r.id === id));
    if (unknown.length > 0) throw new CorpusError(`--only names no repository of the manifest: ${unknown.join(', ')}`);
    return repos.filter((r) => opts.only.includes(r.id));
  }
  return repos.filter((r) => opts.tier === 'all' || r.tier === opts.tier);
}

/** Every disagreement an oracle can report, as `<oracle>:<disagreement>`. An explanation of any other kind is refused, so a misspelt kind cannot explain nothing in silence. */
const ORACLE_KINDS = new Set([
  'typescript:false-edge', 'typescript:recall-loss', 'typescript:mismatch',
  'python:false-edge',
  'cargo:mismatch', 'cargo:crlf',
  'go:false-edge', 'go:recall-loss', 'go:mismatch',
  'csharp:recall-loss', 'csharp:false-reach',
  'c:false-edge', 'c:unreadable',
]);

const EDGE_FORM = '- `<repository>` `<+|->` `<from>:<line>` `<target>`: <reason>';
const ORACLE_FORM = "- `<repository>` `<oracle>:<disagreement>` `<from>:<line>` `<subject>` `<Runes' answer>` `<the oracle's answer>`: <reason>";

/** The backticked fields of a list item and the reason after the colon that closes them, or undefined when the item does not read that way. */
function entryFields(raw) {
  let rest = raw.slice(2);
  const fields = [];
  for (;;) {
    const m = /^`([^`]*)`/.exec(rest);
    if (!m) return undefined;
    fields.push(m[1]);
    rest = rest.slice(m[0].length);
    if (rest.startsWith(' `')) rest = rest.slice(1);
    else if (rest.startsWith(':')) return { fields, reason: rest.slice(1).trim() };
    else return undefined;
  }
}

/**
 * corpus/explained.md: every list item of the form
 *   - `<repository>` `<+|->` `<from>:<line>` `<target>`: <reason>
 * explains one change of the edge comparison: `+` an edge the golden lacks, `-` an edge of the golden that is gone. An oracle disagreement is explained by
 *   - `<repository>` `<oracle>:<disagreement>` `<from>:<line>` `<subject>` `<Runes' answer>` `<the oracle's answer>`: <reason>
 * which names both answers, so it stops matching the moment either side answers otherwise: an explanation cannot outlive the answers it was written for. `<line>` may be `*`, every line of that file. A list item that opens with a backtick and does not parse, names a repository the manifest does not hold, names a kind no comparison reports, has the wrong fields for its kind, or gives no reason fails the run with its line: a typo must not explain nothing silently. Fenced code blocks are skipped. Returns each entry by its key, with where it stands.
 */
function loadExplained(file, repoIds) {
  const entries = new Map();
  if (!existsSync(file)) return entries;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let fenced = false;
  lines.forEach((raw, i) => {
    if (/^\s*```/.test(raw)) fenced = !fenced;
    if (fenced || !raw.startsWith('- `')) return;
    const where = `${path.basename(file)}:${i + 1}`;
    const parsed = entryFields(raw);
    const site = parsed === undefined ? null : /^(.+):(\d+|\*)$/.exec(parsed.fields[2] ?? '');
    if (parsed === undefined || parsed.fields.length < 4 || site === null) throw new CorpusError(`${where}: an entry must read ${EDGE_FORM}, or for an oracle ${ORACLE_FORM}`);
    const { fields, reason } = parsed;
    const [repo, kind, , target, ...answers] = fields;
    if (!repoIds.has(repo)) throw new CorpusError(`${where}: no repository '${repo}' in the manifest`);
    const isEdge = kind === '+' || kind === '-';
    if (!isEdge && !ORACLE_KINDS.has(kind)) throw new CorpusError(`${where}: no comparison reports the kind '${kind}'; it must be +, - or one of ${[...ORACLE_KINDS].join(', ')}`);
    if (isEdge && answers.length !== 0) throw new CorpusError(`${where}: an edge entry ends at its target: ${EDGE_FORM}`);
    if (!isEdge && answers.length !== 2) throw new CorpusError(`${where}: an oracle entry names both answers it explains after the subject: ${ORACLE_FORM}`);
    if (reason === '') throw new CorpusError(`${where}: the entry gives no reason`);
    entries.set(explainKey(repo, kind, site[1], site[2], target, answers), { where, repo, kind, text: raw });
  });
  return entries;
}

const explainKey = (repo, kind, from, line, target, answers = []) => [repo, kind, `${from}:${line}`, target, ...answers].join('\t');

/** The key of the entry that explains this change or disagreement (its own line first, then `*`), or undefined. */
function explainedBy(entries, repo, kind, from, line, target, answers = []) {
  return [explainKey(repo, kind, from, String(line), target, answers), explainKey(repo, kind, from, '*', target, answers)].find((k) => entries.has(k));
}

/** An oracle disagreement in the form of the entry that would explain it, without the reason. */
const oracleEntry = (repo, f) => `- \`${repo}\` \`${f.oracle}:${f.kind}\` \`${f.from}:${f.line}\` \`${f.subject}\` \`${f.runes}\` \`${f.answer}\``;

// ---------------------------------------------------------------------------
// Fetching a pinned commit

function git(args, cwd, input) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', input, maxBuffer: 1 << 30, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (res.error) throw new CorpusError(`git ${args.join(' ')}: ${res.error.message}`);
  if (res.status !== 0) throw new CorpusError(`git ${args.join(' ')} exited ${res.status}: ${(res.stderr || '').trim()}`);
  return res.stdout;
}

/** The clone of one pinned commit, fetched once into the cache. A partial fetch lives under a temporary name and only a verified one is renamed into place, so an interrupted run leaves nothing that looks complete. Any failure is fatal: a repository that cannot be fetched is never skipped. */
function fetchRepository(repo, cache) {
  const dir = path.join(cache, `${repo.id}@${repo.commit}`);
  if (existsSync(path.join(dir, '.git'))) {
    const head = git(['rev-parse', 'HEAD'], dir).trim();
    if (head !== repo.commit) throw new CorpusError(`${dir}: HEAD is ${head}, not the pinned ${repo.commit}; the cache directory is damaged`);
    return dir;
  }
  mkdirSync(cache, { recursive: true });
  const tmp = `${dir}.partial-${process.pid}-${Date.now()}`;
  try {
    git(['init', '-q', tmp], cache);
    git(['config', 'core.autocrlf', 'false'], tmp);
    git(['config', 'core.symlinks', 'true'], tmp);
    git(['remote', 'add', 'origin', repo.url], tmp);
    const fetchArgs = ['fetch', '-q', '--depth', '1', '--no-tags'];
    if (repo.sparse !== undefined) {
      git(['sparse-checkout', 'set', '--no-cone', '--stdin'], tmp, `${repo.sparse.join('\n')}\n`);
      fetchArgs.push('--filter=blob:none');
    }
    git([...fetchArgs, 'origin', repo.commit], tmp);
    git(['-c', 'advice.detachedHead=false', 'checkout', '-q', repo.commit], tmp);
    const head = git(['rev-parse', 'HEAD'], tmp).trim();
    if (head !== repo.commit) throw new CorpusError(`checked out ${head}, not ${repo.commit}`);
  } catch (err) {
    throw new CorpusError(`fetch of ${repo.id} (${repo.url} at ${repo.commit}) failed: ${err.message}`);
  }
  renameSync(tmp, dir);
  return dir;
}

/** The files git tracks at the checked-out commit and keeps in the work tree (a sparse checkout's skipped files are not there): `{ path, mode }`, without submodules. */
function trackedFiles(dir) {
  const out = [];
  for (const rec of git(['ls-files', '-s', '-t', '-z'], dir).split('\0')) {
    if (rec === '') continue;
    const m = /^(\S) (\d{6}) [0-9a-f]+ \d\t([\s\S]*)$/.exec(rec);
    if (!m) throw new CorpusError(`${dir}: unexpected git ls-files record ${JSON.stringify(rec)}`);
    const [, tag, mode, file] = m;
    if (tag === 'S' || mode === '160000') continue;
    out.push({ path: file, mode });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Resolving one repository

async function loadRunes(dir) {
  const imp = (rel) => import(pathToFileURL(path.join(dir, 'dist', rel)).href);
  if (!existsSync(path.join(dir, 'dist', 'relations', 'index.mjs'))) throw new CorpusError(`${dir}: no dist/relations/index.mjs; build that Runes first`);
  const [relations, grammars, ast] = await Promise.all([imp('relations/index.mjs'), imp('grammars/index.mjs'), imp('ast/index.mjs')]);
  const TreeSitter = await import('web-tree-sitter');
  const grammarDir = process.env.RUNES_TEST_GRAMMARS ?? path.join(ROOT, '.grammars');
  if (!existsSync(grammarDir)) throw new CorpusError(`${grammarDir} is missing; run npm run grammars first`);
  const host = ast.createParserHost({
    runtime: TreeSitter,
    runtimeIdentity: () => ast.fileSha256(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
    grammarDirs: [grammarDir],
  });
  return { dir, version: relations.version, relations, grammars, host };
}

const dirOf = (file) => {
  const d = path.posix.dirname(file);
  return d === '.' ? '' : d;
};

/**
 * Every reference of one checked-out repository, resolved as the catalogue runner resolves a case: the universe symbol table from every file's declarations, the C# project scopes and reachability, the path resolver over a listed view of the tracked files, then the ordered candidate walk of each detected reference. Returns the golden lines, the per-reference records the oracles compare against, the files and a read function, and any extractor failure (each one fails the run).
 */
async function resolveRepository(repoDir, runes) {
  const { relations, grammars, host } = runes;
  const tracked = trackedFiles(repoDir);
  const modes = new Map(tracked.map((f) => [f.path, f.mode]));
  const contents = new Map();
  const read = (p) => {
    if (contents.has(p)) return contents.get(p);
    const mode = modes.get(p);
    if (mode === undefined) return undefined;
    const abs = path.join(repoDir, p);
    // A symbolic link is the text of its target, as git stores it; a consumer that reads the commit sees the same.
    const text = mode === '120000' ? readlinkSync(abs, 'utf8') : readFileSync(abs, 'utf8');
    contents.set(p, text);
    return text;
  };
  const siblings = new Map();
  for (const f of tracked) {
    const d = dirOf(f.path);
    if (!siblings.has(d)) siblings.set(d, []);
    siblings.get(d).push(path.posix.basename(f.path));
  }
  const view = typeof relations.listedFileView === 'function' ? relations.listedFileView(tracked.map((f) => f.path), read) : undefined;
  // A file at the root of the repository is the root directory's, named '.': an empty owner would read as no owner.
  const ownerIndex = { ownerOf: (file) => (modes.has(file) ? dirOf(file) || '.' : undefined) };

  // Pass 1: parse each source file once, keep its declarations and its detected references (plain data), and let the tree go.
  const sources = [];
  const failures = [];
  let binaries = 0;
  const symbolTable = new relations.SymbolTable();
  for (const f of tracked) {
    if (f.mode === '120000') continue;
    let language = grammars.relationLanguageForPath(f.path, () => siblings.get(dirOf(f.path)) ?? []);
    let parsePath = f.path;
    let code;
    if (language === null) {
      if (!/\.(vue|svelte)$/i.test(f.path)) continue;
      const sfc = relations.sfcScriptView(f.path, read(f.path));
      if (sfc === null) continue;
      ({ language, parsePath, content: code } = sfc);
    }
    const extractor = relations.extractorForLanguage(language);
    if (!extractor) continue;
    code ??= read(f.path);
    // A file with a NUL byte in its first 8000 bytes is binary, by git's own test (an MPEG transport stream named .ts, a compiled asset): it is no source, and parsing it costs seconds per megabyte.
    if (code.slice(0, 8000).includes('\0')) {
      binaries++;
      continue;
    }
    const override = grammars.getLanguageForExtension(path.posix.extname(parsePath)) === language ? undefined : language;
    try {
      const record = await host.withParsedFile(parsePath, code, (tree) => {
        const parsed = { path: f.path, content: code, tree, language, newParser: host.newParser };
        const declarations = extractor.declarations(parsed);
        if (language === 'csharp') {
          const extract = relations.extractCsharpRefs(parsed);
          return { path: f.path, language, declarations, extract };
        }
        return { path: f.path, language, declarations, detected: extractor.uses(parsed) };
      }, override);
      for (const d of record.declarations) symbolTable.declare(language, d.symbolKey, f.path);
      sources.push(record);
    } catch (err) {
      failures.push(`${f.path}: ${language} extraction threw: ${err?.message ?? err}`);
    }
  }

  // The C# pre-pass: project-wide global usings and the project reference graph.
  const csharp = sources.filter((s) => s.language === 'csharp');
  const scopes = relations.buildCsharpProjectScopes(repoDir, csharp.map((s) => ({ path: s.path, globalPrefixes: s.extract.scope.globalPrefixes, globalAliases: [...s.extract.scope.globalAliases.entries()] })), { files: view });
  const reach = typeof relations.buildCsharpReachability === 'function' ? relations.buildCsharpReachability(repoDir, csharp.map((s) => s.path), { files: view }) : undefined;
  const diagnostics = [];
  const resolvePathToFile = relations.makeResolvePathToFile(repoDir, ownerIndex.ownerOf, undefined, { files: view, onDiagnostic: (d) => diagnostics.push(d) });
  const resolver = relations.makeResolver({ ownerIndex, symbolTable, resolvePathToFile, reach });

  // Pass 2: the ordered candidate walk of every reference (the walk resolveCandidateGroup runs), keeping the file each binding lands in.
  const lines = new Set();
  const references = [];
  for (const s of sources) {
    const detected = s.language === 'csharp'
      ? relations.assembleCsharpCandidates(s.extract, { projectGlobalUsings: scopes.get(s.path)?.usings ?? [], projectGlobalUsingAliases: scopes.get(s.path)?.aliases ?? [] })
      : s.detected;
    for (const dep of detected) {
      let resolved;
      try {
        for (const cand of dep.candidates) {
          const outcome = resolver.classify(cand, s.path, s.language);
          if (outcome.kind === 'resolved') {
            resolved = outcome.resolvedFile;
            break;
          }
          if (outcome.kind === 'ambiguous') break;
        }
      } catch (err) {
        failures.push(`${s.path}:${dep.line}: resolution threw: ${err?.message ?? err}`);
        continue;
      }
      references.push({ from: s.path, line: dep.line, language: s.language, candidates: dep.candidates, resolved });
      if (resolved !== undefined && resolved !== s.path) lines.add(`${s.path}:${dep.line}\t${resolved}`);
    }
  }
  return { lines: [...lines].sort(), references, tracked, read, view, reach, csharpFiles: csharp.map((s) => s.path), failures, diagnostics, parsed: sources.length, binaries };
}

// ---------------------------------------------------------------------------
// Goldens

const GOLDEN_HEADER = /^# runes corpus golden: (\S+) at ([0-9a-f]{40})$/;

function readGolden(file) {
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, 'utf8');
  const all = text.split('\n');
  const head = GOLDEN_HEADER.exec(all[0] ?? '');
  if (!head) throw new CorpusError(`${file}: the first line must be '# runes corpus golden: <id> at <commit>'`);
  return { id: head[1], commit: head[2], lines: all.slice(1).filter((l) => l !== '') };
}

function writeGolden(file, repo, lines) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `# runes corpus golden: ${repo.id} at ${repo.commit}\n${lines.map((l) => `${l}\n`).join('')}`);
}

function splitLine(line) {
  const tab = line.indexOf('\t');
  const site = line.slice(0, tab);
  const colon = site.lastIndexOf(':');
  return { from: site.slice(0, colon), line: site.slice(colon + 1), target: line.slice(tab + 1) };
}

/** The added and removed lines between a golden and the current resolution, each with whether explained.md explains it. */
function diffAgainstGolden(repo, golden, current, explained) {
  const before = new Set(golden.lines);
  const after = new Set(current);
  const changes = [];
  for (const l of current) if (!before.has(l)) changes.push({ sign: '+', ...splitLine(l) });
  for (const l of golden.lines) if (!after.has(l)) changes.push({ sign: '-', ...splitLine(l) });
  for (const c of changes) c.explained = explainedBy(explained, repo.id, c.sign, c.from, c.line, c.target) !== undefined;
  return changes;
}

const formatChange = (c) => `${c.sign} ${c.from}:${c.line} -> ${c.target}`;

/** Prints the first unexplained findings and writes all of them to a report file in the cache, so a long list stays readable in a CI log. */
function reportUnexplained(cache, repo, label, items) {
  const shown = items.slice(0, 100);
  for (const s of shown) process.stdout.write(`    UNEXPLAINED ${s}\n`);
  if (items.length > shown.length) {
    const reportDir = path.join(cache, 'reports');
    mkdirSync(reportDir, { recursive: true });
    const file = path.join(reportDir, `${repo.id}.${label}.txt`);
    writeFileSync(file, items.map((s) => `${s}\n`).join(''));
    process.stdout.write(`    ... and ${items.length - shown.length} more; the whole list is in ${file}\n`);
  }
}

// ---------------------------------------------------------------------------
// Oracles

const TS_LANGUAGES = new Set(['typescript', 'tsx', 'javascript']);
const TS_SOURCE_EXT = /\.(?:d\.)?(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * What an install would link into node_modules: the packages of the repository's declared workspaces (package.json `workspaces`, pnpm-workspace.yaml `packages`) by name, and for pnpm, which of them each package declares as a dependency. npm and yarn hoist every workspace package into the root node_modules; pnpm links into a package's own node_modules only what that package declares, and the root's node_modules holds what the root declares.
 */
function workspaceLinks(tracked, read) {
  const globs = [];
  const rootPkg = tracked.some((f) => f.path === 'package.json') ? safeJson(read('package.json')) : undefined;
  const ws = rootPkg?.workspaces;
  if (Array.isArray(ws)) globs.push(...ws);
  else if (Array.isArray(ws?.packages)) globs.push(...ws.packages);
  const pnpm = tracked.some((f) => f.path === 'pnpm-workspace.yaml');
  if (pnpm) {
    let inPackages = false;
    for (const raw of read('pnpm-workspace.yaml').split(/\r?\n/)) {
      if (/^packages\s*:/.test(raw)) {
        inPackages = true;
        continue;
      }
      if (inPackages && /^\S/.test(raw)) inPackages = false;
      const item = inPackages ? /^\s*-\s*['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/.exec(raw) : null;
      if (item) globs.push(item[1]);
    }
  }
  const toRegex = (g) => new RegExp(`^${g.replace(/^\.\//, '').replace(/\/+$/, '').split('/').map((seg) => (seg === '**' ? '.*' : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))).join('/')}$`);
  const include = globs.filter((g) => !g.startsWith('!')).map(toRegex);
  const exclude = globs.filter((g) => g.startsWith('!')).map((g) => toRegex(g.slice(1)));
  const packages = new Map();
  const declared = new Map();
  const declaredBy = (pkg) => new Set(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((k) => (pkg?.[k] !== null && typeof pkg?.[k] === 'object' ? Object.keys(pkg[k]) : [])));
  declared.set('', declaredBy(rootPkg));
  for (const f of tracked) {
    if (path.posix.basename(f.path) !== 'package.json' || f.path === 'package.json' || f.path.includes('node_modules/')) continue;
    const d = dirOf(f.path);
    if (!include.some((r) => r.test(d)) || exclude.some((r) => r.test(d))) continue;
    const pkg = safeJson(read(f.path));
    if (typeof pkg?.name === 'string' && !packages.has(pkg.name)) packages.set(pkg.name, d);
    declared.set(d, declaredBy(pkg));
  }
  // Node lets a package import itself by its own name when its package.json has `exports`.
  const selfNamed = typeof rootPkg?.name === 'string' && rootPkg.exports !== undefined && !packages.has(rootPkg.name) ? rootPkg.name : undefined;
  if (selfNamed !== undefined) packages.set(selfNamed, '');
  /** The directory `<owner>/node_modules/<name>` links to, or undefined when nothing is linked there. */
  const linked = (owner, name) => {
    const target = packages.get(name);
    if (target === undefined || !declared.has(owner)) return undefined;
    if (name === selfNamed) return owner === '' ? target : undefined;
    if (!pnpm) return owner === '' ? target : undefined;
    return declared.get(owner).has(name) ? target : undefined;
  };
  return { packages, linked };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Extensions TypeScript resolves by itself; a module with any other extension (`.vue`, `.svelte`, `.png`, `.css`) is a bundler's, and the oracle gives it a virtual `<file>.ts` beside it, as vue-tsc and svelte-check do, so TypeScript's own path mapping still decides where it lands. */
const TS_OWN_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/i;

/** TypeScript's own module resolution for every TS and JS path reference, with each file's tsconfig (the first referenced project that includes it when the nearest one is a solution, as the editor chooses), JavaScript and JSON allowed, and the workspace packages linked into a virtual node_modules as an install would link them. */
async function typescriptOracle(repoDir, result, findings) {
  let ts;
  try {
    ts = (await import('typescript')).default;
  } catch (err) {
    return { skipped: `the typescript package is not installed (${err.message})` };
  }
  const deps = result.references.filter((r) => TS_LANGUAGES.has(r.language) || /\.(vue|svelte)$/i.test(r.from)).filter((r) => r.candidates.length > 0 && r.candidates.every((c) => c.kind === 'path'));
  if (deps.length === 0) return { checked: 0 };
  const listed = new Set(result.tracked.map((f) => f.path));
  const { packages, linked } = workspaceLinks(result.tracked, result.read);
  const rel = (abs) => path.relative(repoDir, abs).split(path.sep).join('/');
  // A path on disk, or where a virtual node_modules link points, or `{ dir: true }` for a directory that holds links only; null for nothing.
  const mapped = (p) => {
    if (ts.sys.fileExists(p) || ts.sys.directoryExists(p)) return p;
    const r = rel(p);
    if (r.startsWith('..')) return p;
    const at = r.lastIndexOf('node_modules');
    if (at === -1 || (at > 0 && r[at - 1] !== '/')) return p;
    const owner = at === 0 ? '' : r.slice(0, at - 1);
    const rest = r.slice(at + 'node_modules'.length + 1);
    if (r.slice(at) === 'node_modules') return [...packages.keys()].some((n) => linked(owner, n) !== undefined) ? { dir: true } : null;
    const segs = rest.split('/');
    const scoped = segs[0].startsWith('@');
    if (scoped && segs.length === 1) return [...packages.keys()].some((n) => n.startsWith(`${segs[0]}/`) && linked(owner, n) !== undefined) ? { dir: true } : null;
    const target = linked(owner, scoped ? segs.slice(0, 2).join('/') : segs[0]);
    return target === undefined ? null : path.join(repoDir, target, ...segs.slice(scoped ? 2 : 1));
  };
  const virtualOf = (p) => (p.endsWith('.ts') && !TS_OWN_EXT.test(p.slice(0, -3)) && /\.[A-Za-z0-9]+$/.test(p.slice(0, -3)) ? p.slice(0, -3) : undefined);
  const host = {
    fileExists: (p) => {
      const m = mapped(p);
      if (typeof m === 'string' && ts.sys.fileExists(m)) return true;
      const v = virtualOf(p);
      if (v === undefined) return false;
      const mv = mapped(v);
      return typeof mv === 'string' && ts.sys.fileExists(mv);
    },
    directoryExists: (p) => {
      const m = mapped(p);
      return m?.dir === true || (typeof m === 'string' && ts.sys.directoryExists(m));
    },
    readFile: (p) => {
      const m = mapped(p);
      if (typeof m === 'string' && ts.sys.fileExists(m)) return ts.sys.readFile(m);
      return virtualOf(p) !== undefined ? '' : undefined;
    },
    realpath: (p) => {
      const v = virtualOf(p);
      if (v !== undefined && !ts.sys.fileExists(p)) {
        const mv = mapped(v);
        return `${typeof mv === 'string' ? (ts.sys.realpath?.(mv) ?? mv) : v}.ts`;
      }
      const m = mapped(p);
      return typeof m === 'string' ? (ts.sys.realpath?.(m) ?? m) : p;
    },
    getCurrentDirectory: () => repoDir,
    getDirectories: (p) => {
      const m = mapped(p);
      return typeof m === 'string' ? ts.sys.getDirectories(m) : [];
    },
    useCaseSensitiveFileNames: true,
  };
  const configHost = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} };
  const extra = [{ extension: '.vue', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }, { extension: '.svelte', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }];
  const parsedConfigs = new Map();
  const parseConfig = (abs) => {
    if (!parsedConfigs.has(abs)) {
      let parsed;
      try {
        parsed = ts.getParsedCommandLineOfConfigFile(abs, undefined, configHost, undefined, undefined, extra);
      } catch {
        parsed = undefined;
      }
      parsedConfigs.set(abs, parsed ? { parsed, files: new Set(parsed.fileNames), cache: ts.createModuleResolutionCache(repoDir, (s) => s, parsed.options) } : null);
    }
    return parsedConfigs.get(abs);
  };
  const nearestConfig = new Map();
  const configFor = (from) => {
    const d = dirOf(from);
    if (!nearestConfig.has(d)) {
      let found = null;
      for (let cur = d; ; cur = dirOf(cur)) {
        const name = ['tsconfig.json', 'jsconfig.json'].map((n) => (cur === '' ? n : `${cur}/${n}`)).find((n) => listed.has(n));
        if (name) {
          found = path.join(repoDir, name);
          break;
        }
        if (cur === '') break;
      }
      nearestConfig.set(d, found);
    }
    const nearest = nearestConfig.get(d);
    if (nearest === null) return null;
    const abs = path.join(repoDir, from);
    const top = parseConfig(nearest);
    if (top === null) return null;
    if (top.files.has(abs)) return top;
    // A solution-style config includes nothing itself; the referenced project that includes the file decides, as the editor decides.
    const queue = [...(top.parsed.projectReferences ?? [])];
    for (let depth = 0; queue.length > 0 && depth < 64; depth++) {
      const ref = queue.shift();
      const refPath = ts.resolveProjectReferencePath(ref);
      if (!existsSync(refPath)) continue;
      const sub = parseConfig(refPath);
      if (sub === null) continue;
      if (sub.files.has(abs)) return sub;
      queue.push(...(sub.parsed.projectReferences ?? []));
    }
    return top;
  };
  const defaults = { cache: undefined, parsed: { options: { moduleResolution: ts.ModuleResolutionKind.Node10, module: ts.ModuleKind.CommonJS } } };
  const sameStem = (a, b) => a.replace(TS_SOURCE_EXT, '') === b.replace(TS_SOURCE_EXT, '');
  let checked = 0;
  for (const r of deps) {
    const specifier = r.candidates[0].specifier;
    const config = configFor(r.from) ?? defaults;
    const options = { ...config.parsed.options, allowJs: true, resolveJsonModule: true, noEmit: true };
    const containing = path.join(repoDir, r.from);
    let mode;
    try {
      mode = ts.getImpliedNodeFormatForFile(containing, config.cache?.getPackageJsonInfoCache?.(), host, options);
    } catch {
      mode = undefined;
    }
    // A query or a fragment (`./x.mjs?v=1`) names the same file to Node's ESM loader and to a bundler; TypeScript does not read one.
    const res = ts.resolveModuleName(specifier.replace(/[?#].*$/, ''), containing, options, host, config.cache, undefined, mode);
    const file = res.resolvedModule?.resolvedFileName;
    let target = file === undefined ? undefined : rel(host.realpath(file));
    // The virtual `<file>.ts` of a component or an asset stands for the file itself.
    if (target !== undefined && !listed.has(target) && virtualOf(target) !== undefined && listed.has(virtualOf(target))) target = virtualOf(target);
    // In the repository means a tracked file: a fixture under a committed node_modules counts, an installed package never does.
    const tsTarget = target !== undefined && listed.has(target) ? target : undefined;
    checked++;
    const runesTarget = r.resolved;
    if (runesTarget === tsTarget) continue;
    if (runesTarget !== undefined && tsTarget !== undefined && /\.d\.[mc]?ts$/.test(tsTarget) && sameStem(runesTarget, tsTarget)) continue;
    const kind = runesTarget === undefined ? 'recall-loss' : tsTarget === undefined ? 'false-edge' : 'mismatch';
    findings.push({ oracle: 'typescript', kind, from: r.from, line: r.line, subject: specifier, runes: runesTarget ?? 'silent', answer: tsTarget ?? 'unresolved in the repository' });
  }
  return { checked };
}

const PYTHON_FINDER = `
import json, os, sys
from importlib.machinery import PathFinder
req = json.load(sys.stdin)
memo = {}
def find(mod, base):
    key = (mod, base)
    if key in memo:
        return memo[key]
    parts = mod.split('.')
    search = [base]
    spec = None
    out = None
    for i in range(len(parts)):
        spec = PathFinder.find_spec(parts[i], search)
        if spec is None:
            break
        if i < len(parts) - 1:
            locs = getattr(spec.submodule_search_locations, '_path', spec.submodule_search_locations)
            if not locs:
                spec = None
                break
            search = list(locs)
    if spec is not None and spec.origin and os.path.isfile(spec.origin):
        out = spec.origin
    memo[key] = out
    return out
res = []
for q in req:
    hits = set()
    for mod, bases in q:
        for base in bases:
            if mod == '':
                init = os.path.join(base, '__init__.py')
                if os.path.isfile(init):
                    hits.add(init)
            else:
                # "from m import n" is written as m.n: n may be a module of m or a name m defines, so m itself is a binding too.
                for target in ([mod, mod.rpartition('.')[0]] if '.' in mod else [mod]):
                    hit = find(target, base)
                    if hit is not None:
                        hits.add(hit)
    res.append(sorted(hits))
json.dump(res, sys.stdout)
`;

const PYTHON_MANIFESTS = new Set(['pyproject.toml', 'setup.cfg', 'setup.py']);

/** Python's PathFinder on every place the module could be imported from: each directory that holds a project manifest (and its src/), and each ancestor directory of the importing file, which covers a script's own directory and a test runner's root. A reference Runes resolves to a file that PathFinder finds from none of them is a false edge. A reference Runes leaves silent is not checked: the interpreter's real sys.path is an installation's, and silence is Runes' answer to ambiguity. */
function pythonOracle(repoDir, result, findings) {
  const deps = result.references.filter((r) => r.language === 'python' && r.resolved !== undefined && r.candidates.every((c) => c.kind === 'path'));
  if (deps.length === 0) return { checked: 0 };
  const probe = spawnSync(PYTHON, ['-I', '-c', 'import sys; print(sys.version_info >= (3, 11))'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return { skipped: `${PYTHON} is not available (${probe.error?.message ?? probe.stderr})` };
  const listed = new Set(result.tracked.map((f) => f.path));
  const dirs = new Set(result.tracked.map((f) => dirOf(f.path)));
  const roots = new Set();
  for (const f of result.tracked) {
    if (!PYTHON_MANIFESTS.has(path.posix.basename(f.path))) continue;
    const d = dirOf(f.path);
    roots.add(d);
    const src = d === '' ? 'src' : `${d}/src`;
    if (dirs.has(src) || [...dirs].some((x) => x.startsWith(`${src}/`))) roots.add(src);
  }
  const abs = (rel) => (rel === '' ? repoDir : path.join(repoDir, rel));
  const queries = deps.map((r) => r.candidates.map((c) => {
    const spec = c.specifier;
    if (spec.startsWith('.')) {
      const dots = /^\.+/.exec(spec)[0].length;
      let base = dirOf(r.from);
      for (let i = 1; i < dots; i++) base = dirOf(base);
      return [spec.slice(dots), [abs(base)]];
    }
    const bases = new Set([...roots].map(abs));
    for (let cur = dirOf(r.from); ; cur = dirOf(cur)) {
      bases.add(abs(cur));
      if (cur === '') break;
    }
    return [spec, [...bases]];
  }));
  const run = spawnSync(PYTHON, ['-I', '-c', PYTHON_FINDER], { input: JSON.stringify(queries), encoding: 'utf8', maxBuffer: 1 << 30, cwd: os.tmpdir() });
  if (run.error || run.status !== 0) throw new CorpusError(`the Python oracle failed: ${run.error?.message ?? run.stderr}`);
  const answers = JSON.parse(run.stdout);
  deps.forEach((r, i) => {
    const hits = answers[i].map((h) => path.relative(repoDir, h).split(path.sep).join('/')).filter((h) => listed.has(h));
    if (!hits.includes(r.resolved)) findings.push({ oracle: 'python', kind: 'false-edge', from: r.from, line: r.line, subject: r.candidates.map((c) => c.specifier).join(' | '), runes: r.resolved, answer: hits.length === 0 ? 'no file' : hits.join(', ') });
  });
  return { checked: deps.length };
}

const CARGO_READER = `
import json, sys, tomllib
TARGETS = {'bin': 'src/bin', 'test': 'tests', 'example': 'examples', 'bench': 'benches'}
FLAGS = {'autobins': 'src/bin', 'autotests': 'tests', 'autoexamples': 'examples', 'autobenches': 'benches'}
DEP_TABLES = ('dependencies', 'dev-dependencies', 'build-dependencies', 'dev_dependencies', 'build_dependencies')
def spec(v):
    out = {'workspace': False}
    if isinstance(v, dict):
        if isinstance(v.get('path'), str): out['path'] = v['path']
        if isinstance(v.get('package'), str): out['package'] = v['package']
        out['workspace'] = v.get('workspace') is True
    return out
def project(text):
    d = tomllib.loads(text)
    pkg = d.get('package') if isinstance(d.get('package'), dict) else {}
    lib = d.get('lib') if isinstance(d.get('lib'), dict) else {}
    name = lib.get('name') if isinstance(lib.get('name'), str) else pkg.get('name') if isinstance(pkg.get('name'), str) else None
    paths, named = [], []
    for kind, dirname in TARGETS.items():
        for t in d.get(kind, []) if isinstance(d.get(kind), list) else []:
            if not isinstance(t, dict): continue
            if 'path' in t:
                if isinstance(t['path'], str): paths.append(t['path'])
            elif isinstance(t.get('name'), str): named.append(dirname + '/' + t['name'])
    edition = pkg.get('edition')
    ws = d.get('workspace') if isinstance(d.get('workspace'), dict) else {}
    wsp = ws.get('package') if isinstance(ws.get('package'), dict) else {}
    tables = []
    for t in DEP_TABLES:
        if isinstance(d.get(t), dict): tables.append(d[t])
    for cfg in (d.get('target') or {}).values() if isinstance(d.get('target'), dict) else []:
        if isinstance(cfg, dict):
            for t in DEP_TABLES:
                if isinstance(cfg.get(t), dict): tables.append(cfg[t])
    deps, conflicted = {}, set()
    for t in tables:
        for k, v in t.items():
            s = spec(v)
            if k in deps and deps[k] != s: conflicted.add(k)
            deps.setdefault(k, s)
    return {
        'crateName': None if name is None else name.replace('-', '_'),
        'libPath': lib.get('path') if isinstance(lib.get('path'), str) else None,
        'targetPaths': sorted(paths),
        'undiscoveredDirs': sorted(set(dirname for flag, dirname in FLAGS.items() if pkg.get(flag) is False)),
        'namedTargets': sorted(named),
        'hasPackage': 'package' in d,
        'edition': edition if isinstance(edition, str) else None,
        'editionInherited': isinstance(edition, dict) and edition.get('workspace') is True,
        'workspaceEdition': wsp.get('edition') if isinstance(wsp.get('edition'), str) else None,
        'dependencies': {k: v for k, v in sorted(deps.items()) if k not in conflicted},
        'conflicted': sorted(conflicted),
        'workspaceDependencies': {k: spec(v) for k, v in sorted((ws.get('dependencies') or {}).items())} if isinstance(ws.get('dependencies'), dict) else {},
    }
out = {}
for p, text in json.load(sys.stdin).items():
    try:
        out[p] = project(text)
    except Exception as e:
        out[p] = {'error': str(e)}
json.dump(out, sys.stdout)
`;

/** Every Cargo.toml read by Runes' manifest reader and by Python's tomllib, field by field, and once more with CRLF line ends, which must read the same. A manifest tomllib refuses is not compared (Runes reads leniently by design). A crate declared in two dependency tables with different specs is not compared either, because tomllib does not keep which came first. */
async function cargoOracle(result, runes, findings) {
  const manifests = result.tracked.filter((f) => path.posix.basename(f.path) === 'Cargo.toml' && f.mode !== '120000').map((f) => f.path);
  if (manifests.length === 0) return { checked: 0 };
  const probe = spawnSync(PYTHON, ['-I', '-c', 'import tomllib'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return { skipped: `${PYTHON} with tomllib (3.11 or later) is not available (${probe.error?.message ?? probe.stderr})` };
  const modulePath = path.join(runes.dir, 'dist', 'relations', 'resolve-path.mjs');
  const { parseCargoManifest } = await import(pathToFileURL(modulePath).href);
  if (typeof parseCargoManifest !== 'function') return { skipped: `${modulePath} has no parseCargoManifest` };
  const texts = Object.fromEntries(manifests.map((p) => [p, result.read(p)]));
  const run = spawnSync(PYTHON, ['-I', '-c', CARGO_READER], { input: JSON.stringify(texts), encoding: 'utf8', maxBuffer: 1 << 30, cwd: os.tmpdir() });
  if (run.error || run.status !== 0) throw new CorpusError(`the Cargo oracle failed: ${run.error?.message ?? run.stderr}`);
  const expected = JSON.parse(run.stdout);
  const projectRunes = (m, conflicted) => {
    const specs = (map) => Object.fromEntries([...map.entries()].filter(([k]) => !conflicted.includes(k)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, { workspace: v.workspace === true, ...(v.path !== undefined ? { path: v.path } : {}), ...(v.package !== undefined ? { package: v.package } : {}) }]));
    return {
      crateName: m.crateName ?? null,
      libPath: m.libPath ?? null,
      targetPaths: [...m.targetPaths].sort(),
      undiscoveredDirs: [...new Set(m.undiscoveredDirs)].sort(),
      namedTargets: [...m.namedTargets].sort(),
      hasPackage: m.hasPackage,
      edition: m.edition ?? null,
      editionInherited: m.editionInherited,
      workspaceEdition: m.workspaceEdition ?? null,
      dependencies: specs(m.dependencies),
      workspaceDependencies: specs(m.workspaceDependencies),
    };
  };
  let checked = 0;
  for (const p of manifests) {
    const want = expected[p];
    if (want.error !== undefined) continue;
    const { conflicted } = want;
    delete want.conflicted;
    const lf = projectRunes(parseCargoManifest(texts[p]), conflicted);
    const crlf = projectRunes(parseCargoManifest(texts[p].replace(/\r?\n/g, '\r\n')), conflicted);
    checked++;
    for (const field of Object.keys(want)) {
      const a = JSON.stringify(sortDeep(lf[field]));
      const b = JSON.stringify(sortDeep(want[field]));
      if (a !== b) findings.push({ oracle: 'cargo', kind: 'mismatch', from: p, line: 0, subject: field, runes: a, answer: b });
      const c = JSON.stringify(sortDeep(crlf[field]));
      if (c !== a) findings.push({ oracle: 'cargo', kind: 'crlf', from: p, line: 0, subject: field, runes: a, answer: c });
    }
  }
  return { checked };
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}

/**
 * `go list` of every in-repository package (the module graph comes from the module proxy, checked against go.sum, so the answer is the same on every machine), and each Go import Runes resolves held to the package directory the go command gives, both ways: an import of an in-repository package Runes leaves silent is a recall loss, a binding outside every in-repository package a false edge. Only files of the packages `./...` lists are compared (testdata and vendor are not packages of the build). An import of an in-repository module's path that `./...` leaves out is asked of go list by its import path, from the importing file's module, because the go command imports such a package by its path even where the pattern skips it (a test that imports a package under testdata).
 */
function goOracle(repoDir, result, findings) {
  const deps = result.references.filter((r) => r.language === 'go' && r.candidates.every((c) => c.kind === 'path'));
  if (deps.length === 0) return { checked: 0 };
  const probe = spawnSync('go', ['version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return { skipped: `go is not installed (${probe.error?.message ?? probe.stderr})` };
  const listed = result.tracked.map((f) => f.path);
  const hasWork = listed.includes('go.work');
  const goMods = listed.filter((p) => path.posix.basename(p) === 'go.mod' && !/(^|\/)(testdata|vendor)\//.test(p));
  const moduleDirs = hasWork ? [''] : goMods.map(dirOf);
  const modulePaths = goMods.map((p) => /^\s*module\s+"?([^\s"]+)"?/m.exec(result.read(p))?.[1]).filter((m) => m !== undefined);
  const ofModule = (spec) => modulePaths.some((m) => spec === m || spec.startsWith(`${m}/`));
  const goDirs = new Set(listed.filter((p) => p.endsWith('.go')).map(dirOf));
  const env = { ...process.env, GOFLAGS: '-mod=readonly', GOWORK: hasWork ? path.join(repoDir, 'go.work') : 'off', GOCACHE: process.env.GOCACHE ?? path.join(os.tmpdir(), 'runes-corpus-gocache') };
  const cwdOf = (m) => (m === '' ? repoDir : path.join(repoDir, m));
  /** Runs go list in one module and keeps each in-repository package it gives; an error message when go list itself fails. */
  const list = (m, args, into, keep) => {
    const run = spawnSync('go', ['list', '-e', '-json=ImportPath,Dir', ...args], { cwd: cwdOf(m), env, encoding: 'utf8', maxBuffer: 1 << 30 });
    if (run.error || run.status !== 0) return `go list failed in ${m || '.'}: ${run.error?.message ?? run.stderr.trim().split('\n')[0]}`;
    for (const chunk of run.stdout.split(/\n(?=\{)/)) {
      if (chunk.trim() === '') continue;
      const pkg = JSON.parse(chunk);
      if (typeof pkg.Dir !== 'string') continue;
      const rel = path.relative(repoDir, pkg.Dir).split(path.sep).join('/');
      if (!rel.startsWith('..') && keep(rel)) into.set(pkg.ImportPath, rel);
    }
    return undefined;
  };
  const packageDir = new Map();
  for (const m of moduleDirs) {
    const failed = list(m, ['./...'], packageDir, () => true);
    if (failed !== undefined) return { skipped: failed };
  }
  const packageDirs = new Set(packageDir.values());
  // The module of a file is its nearest module directory; under go.work every module is the workspace's.
  const moduleOf = (file) => moduleDirs.filter((m) => m === '' || file.startsWith(`${m}/`)).sort((a, b) => b.length - a.length)[0];
  const asked = new Map();
  for (const r of deps) {
    const spec = r.candidates[0].specifier;
    const m = moduleOf(r.from);
    if (m === undefined || !packageDirs.has(dirOf(r.from)) || packageDir.has(spec) || !ofModule(spec)) continue;
    if (!asked.has(m)) asked.set(m, new Set());
    asked.get(m).add(spec);
  }
  for (const [m, specs] of asked) {
    const all = [...specs].sort();
    for (let i = 0; i < all.length; i += 100) {
      // A directory with no tracked Go file is no package, whatever go list says of the path.
      const failed = list(m, all.slice(i, i + 100), packageDir, (rel) => goDirs.has(rel));
      if (failed !== undefined) return { skipped: failed };
    }
  }
  let checked = 0;
  for (const r of deps) {
    if (!packageDirs.has(dirOf(r.from))) continue;
    const spec = r.candidates[0].specifier;
    const want = packageDir.get(spec);
    const got = r.resolved === undefined ? undefined : dirOf(r.resolved);
    checked++;
    if (want === got) continue;
    const kind = got === undefined ? 'recall-loss' : want === undefined ? 'false-edge' : 'mismatch';
    findings.push({ oracle: 'go', kind, from: r.from, line: r.line, subject: spec, runes: got ?? 'silent', answer: want ?? 'no package in the repository' });
  }
  return { checked };
}

/** The project reference closure `dotnet msbuild -getItem:ProjectReference` gives for every project, against the reachability Runes builds: a project Runes calls unreachable that the build references is a recall loss, a project Runes calls reachable that the build does not reference is a false reach. Runes' `unknown` (a project it cannot read fully, which reaches everything by design) is not compared. */
function csharpOracle(repoDir, result, findings) {
  if (result.reach === undefined) return { skipped: 'this Runes has no C# reachability' };
  const projects = result.tracked.filter((f) => /\.csproj$/i.test(f.path)).map((f) => f.path);
  if (projects.length === 0) return { checked: 0 };
  const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', MSBUILDDISABLENODEREUSE: '1' };
  const probe = spawnSync('dotnet', ['--version'], { encoding: 'utf8', env, cwd: repoDir });
  if (probe.error || probe.status !== 0) return { skipped: `dotnet is not usable here (${probe.error?.message ?? probe.stderr.trim().split('\n')[0]})` };
  const direct = new Map();
  for (const p of projects) {
    const run = spawnSync('dotnet', ['msbuild', path.join(repoDir, p), '-getItem:ProjectReference', '-nologo'], { encoding: 'utf8', env, cwd: repoDir, maxBuffer: 1 << 28 });
    if (run.error || run.status !== 0) return { skipped: `dotnet msbuild could not evaluate ${p}: ${(run.error?.message ?? run.stdout + run.stderr).trim().split('\n').slice(-1)[0]}` };
    const items = safeJson(run.stdout.slice(run.stdout.indexOf('{')))?.Items?.ProjectReference ?? [];
    direct.set(p, items.map((i) => path.relative(repoDir, i.FullPath).split(path.sep).join('/')));
  }
  const closure = (p) => {
    const seen = new Set();
    const stack = [...(direct.get(p) ?? [])];
    while (stack.length > 0) {
      const q = stack.pop();
      if (seen.has(q)) continue;
      seen.add(q);
      stack.push(...(direct.get(q) ?? []));
    }
    return seen;
  };
  // One C# file per project directory stands for it: Runes' project of a file is its nearest directory holding a project file.
  const projectOf = (file) => {
    for (let d = dirOf(file); ; d = dirOf(d)) {
      const here = projects.filter((p) => dirOf(p) === d);
      if (here.length > 0) return here;
      if (d === '') return [];
    }
  };
  const representative = new Map();
  for (const f of result.csharpFiles) {
    const owners = projectOf(f);
    if (owners.length === 1 && !representative.has(owners[0])) representative.set(owners[0], f);
  }
  let checked = 0;
  for (const [a, fa] of representative) {
    const reached = closure(a);
    for (const [b, fb] of representative) {
      if (a === b) continue;
      const answer = result.reach(fa, fb);
      checked++;
      if (answer === 'unknown') continue;
      const built = reached.has(b);
      if (answer === 'unreachable' && built) findings.push({ oracle: 'csharp', kind: 'recall-loss', from: a, line: 0, subject: b, runes: 'unreachable', answer: 'referenced' });
      if (answer === 'reachable' && !built) findings.push({ oracle: 'csharp', kind: 'false-reach', from: a, line: 0, subject: b, runes: 'reachable', answer: 'not referenced' });
    }
  }
  return { checked };
}

/** The C preprocessor's own include closure (`cc -MM -MG` with the manifest's include directories and defines) of every C and C++ source file, against the include edges Runes gives that file: an include target outside the closure is a false edge. Headers are not compiled on their own, and a target the preprocessor reaches through another header is in the closure too, so only what Runes adds is caught, not what it misses. */
function cOracle(repoDir, repo, result, findings) {
  const deps = result.references.filter((r) => (r.language === 'c' || r.language === 'cpp') && r.resolved !== undefined && r.candidates.every((c) => c.kind === 'path') && /\.(c|cc|cpp|cxx|c\+\+)$/i.test(r.from));
  if (deps.length === 0) return { checked: 0 };
  if (repo.c === undefined) return { skipped: 'the manifest gives no include directories for this repository ("c")' };
  const probe = spawnSync('cc', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return { skipped: `cc is not installed (${probe.error?.message ?? probe.stderr})` };
  const flags = [...(repo.c.include ?? []).map((d) => `-I${d === '' ? repoDir : path.join(repoDir, d)}`), ...(repo.c.defines ?? []).map((d) => `-D${d}`)];
  const byFile = new Map();
  for (const r of deps) {
    if (!byFile.has(r.from)) byFile.set(r.from, []);
    byFile.get(r.from).push(r);
  }
  let checked = 0;
  for (const [file, refs] of byFile) {
    const lang = /\.c$/.test(file) ? 'c' : 'c++';
    const run = spawnSync('cc', ['-MM', '-MG', '-x', lang, ...(lang === 'c++' ? ['-std=c++17'] : []), ...flags, path.join(repoDir, file)], { encoding: 'utf8', cwd: path.join(repoDir, dirOf(file)), maxBuffer: 1 << 26 });
    if (run.error || run.status !== 0) {
      // The preprocessor's first message, with the clone's own directory taken out so that it reads the same on every machine.
      const message = (run.error?.message ?? run.stderr).trim().split('\n')[0].split(`${repoDir}${path.sep}`).join('');
      findings.push({ oracle: 'c', kind: 'unreadable', from: file, line: 0, subject: file, runes: 'not compared', answer: `cc -MM failed: ${message}` });
      continue;
    }
    const closure = new Set();
    for (const word of run.stdout.replace(/\\\n/g, ' ').split(/\s+/).slice(1)) {
      if (word === '') continue;
      const absPath = path.resolve(path.join(repoDir, dirOf(file)), word);
      closure.add(path.relative(repoDir, absPath).split(path.sep).join('/'));
    }
    for (const r of refs) {
      checked++;
      if (!closure.has(r.resolved)) findings.push({ oracle: 'c', kind: 'false-edge', from: r.from, line: r.line, subject: r.resolved, runes: r.resolved, answer: 'not included' });
    }
  }
  return { checked };
}

// ---------------------------------------------------------------------------
// Commands

/** The edges of one resolved repository against its golden (verify, gate), or the golden rewritten from them (update). Prints one line and returns whether it passed. */
function compareEdges(opts, repo, result, head, explained) {
  const goldenFile = path.join(opts.goldens, `${repo.id}.edges`);
  const golden = readGolden(goldenFile);
  if (golden === undefined || golden.commit !== repo.commit) {
    const why = golden === undefined ? 'no golden yet' : `the golden was made at ${golden.commit}, the manifest pins ${repo.commit}`;
    if (opts.command === 'update') {
      writeGolden(goldenFile, repo, result.lines);
      process.stdout.write(`new  ${head}: ${why}; wrote ${path.relative(ROOT, goldenFile)} as a new baseline\n`);
      return true;
    }
    process.stdout.write(`FAIL ${head}: ${why}; run npm run corpus:update -- --only ${repo.id}\n`);
    return false;
  }
  const changes = diffAgainstGolden(repo, golden, result.lines, explained);
  const unexplained = changes.filter((c) => !c.explained);
  const added = changes.filter((c) => c.sign === '+').length;
  const summary = `${head}; ${added} added, ${changes.length - added} removed, ${changes.length - unexplained.length} explained`;
  if (unexplained.length > 0) {
    process.stdout.write(`FAIL ${summary}${opts.command === 'update' ? '; the golden is not rewritten while a change is unexplained' : ''}\n`);
    reportUnexplained(opts.cache, repo, opts.command === 'gate' ? 'verify' : opts.command, unexplained.map(formatChange));
    return false;
  }
  if (opts.command === 'update' && changes.length > 0) {
    writeGolden(goldenFile, repo, result.lines);
    process.stdout.write(`upd  ${summary}; rewrote ${path.relative(ROOT, goldenFile)}\n`);
  } else process.stdout.write(`ok   ${summary}\n`);
  return true;
}

/** Every oracle over one resolved repository, each disagreement held to the explanations. Prints one line, adds what was skipped to `skips`, and returns whether every disagreement is explained. */
async function compareOracles(opts, repo, dir, result, runes, head, explained, skips) {
  const findings = [];
  const outcomes = {
    typescript: await typescriptOracle(dir, result, findings),
    python: pythonOracle(dir, result, findings),
    cargo: await cargoOracle(result, runes, findings),
    go: goOracle(dir, result, findings),
    csharp: csharpOracle(dir, result, findings),
    c: cOracle(dir, repo, result, findings),
  };
  const parts = [];
  for (const [name, o] of Object.entries(outcomes)) {
    if (o.skipped !== undefined) {
      skips.push(`${repo.id} ${name}: ${o.skipped}`);
      parts.push(`${name} SKIPPED`);
    } else if (o.checked > 0) parts.push(`${name} ${o.checked}`);
  }
  const used = new Set();
  const unexplained = [];
  for (const f of findings) {
    const kind = `${f.oracle}:${f.kind}`;
    if (!ORACLE_KINDS.has(kind)) throw new Error(`the ${f.oracle} oracle reported the kind ${kind}, which ORACLE_KINDS does not list`);
    // An entry is backticked text, so an answer holding a backtick is matched with a quote in its place.
    for (const k of ['subject', 'runes', 'answer']) f[k] = String(f[k]).replace(/`/g, "'");
    const key = explainedBy(explained, repo.id, kind, f.from, f.line, f.subject, [f.runes, f.answer]);
    if (key === undefined) unexplained.push(f);
    else used.add(key);
  }
  const status = unexplained.length > 0 ? 'FAIL' : 'ok  ';
  process.stdout.write(`${status} ${head}; checked: ${parts.join(', ') || 'no oracle applies'}; ${findings.length} disagreements, ${findings.length - unexplained.length} explained\n`);
  reportUnexplained(opts.cache, repo, 'oracles', unexplained.map((f) => oracleEntry(repo.id, f)));
  // An entry of an oracle that ran here and matched nothing no longer explains anything: one of the answers moved, or the disagreement is gone. It is named, not failed, because a toolchain of another machine can see a disagreement this one does not.
  const ran = new Set(Object.entries(outcomes).filter(([, o]) => o.skipped === undefined).map(([name]) => name));
  const unused = [...explained].filter(([key, e]) => e.repo === repo.id && ran.has(e.kind.split(':')[0]) && !used.has(key)).map(([, e]) => `${e.where}: ${e.text.slice(0, 200)}`);
  if (unused.length > 0) {
    process.stdout.write(`    ${unused.length} explanations of ${repo.id} match no disagreement of this run:\n`);
    for (const u of unused.slice(0, 20)) process.stdout.write(`    UNUSED ${u}\n`);
    if (unused.length > 20) process.stdout.write(`    ... and ${unused.length - 20} more\n`);
  }
  return unexplained.length === 0;
}

async function main() {
  const opts = parseCommandLine(process.argv.slice(2));
  const repos = loadManifest(opts.manifest);
  const selected = selectRepositories(repos, opts);
  const explained = loadExplained(opts.explained, new Set(repos.map((r) => r.id)));
  const runes = await loadRunes(opts.runes);
  process.stdout.write(`corpus ${opts.command}: ${selected.length} repositories, Runes ${runes.version} from ${path.relative(process.cwd(), runes.dir) || '.'}, cache ${opts.cache}\n`);
  let failed = 0;
  const skips = [];
  for (const repo of selected) {
    const started = Date.now();
    // The clone by its real path: TypeScript, PathFinder, go list and the preprocessor answer with real paths, so a cache reached through a symbolic link (macOS's temporary directory) or an 8.3 short name (Windows) must not make every in-repository answer look like one outside it.
    const dir = realpathSync.native(fetchRepository(repo, opts.cache));
    const result = await resolveRepository(dir, runes);
    const head = `${repo.id} @${repo.commit.slice(0, 10)}: ${result.parsed} files parsed, ${result.binaries} binary skipped, ${result.lines.length} edges, ${result.diagnostics.length} diagnostics, ${((Date.now() - started) / 1000).toFixed(1)} s`;
    if (result.failures.length > 0) {
      failed++;
      process.stdout.write(`FAIL ${head}: ${result.failures.length} extraction or resolution failures\n`);
      reportUnexplained(opts.cache, repo, 'failures', result.failures);
      continue;
    }
    // gate: the edges and the oracles over one resolution of the repository.
    if (opts.command !== 'oracles' && !compareEdges(opts, repo, result, head, explained)) failed++;
    if ((opts.command === 'oracles' || opts.command === 'gate') && !(await compareOracles(opts, repo, dir, result, runes, head, explained, skips))) failed++;
  }
  if (skips.length > 0) {
    process.stdout.write(`\nSKIPPED, not passed (${skips.length}):\n${skips.map((s) => `  ${s}\n`).join('')}`);
    if (opts.strict) {
      process.stdout.write('--strict: a skipped oracle fails the run.\n');
      failed++;
    } else process.stdout.write('This is not a full oracle run; CI runs it with --strict and every toolchain installed.\n');
  }
  process.stdout.write(failed > 0 ? `\ncorpus ${opts.command}: FAILED (${failed})\n` : `\ncorpus ${opts.command}: passed\n`);
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(err instanceof CorpusError ? `corpus: ${err.message}\n` : `corpus: ${err?.stack ?? err}\n`);
    process.exitCode = 1;
  },
);
