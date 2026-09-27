#!/usr/bin/env node
// Runes vendoring tool. A consumer copies this file into its own repository (it is pinned there like every other vendored file) and runs it from its tests and CI. Zero dependencies, Node 22+, git on PATH for the commands that clone.
//
//   check                 sha256 of every vendored file and skill fragment against the pin; offline; exit 1 on any drift
//   check --ci            the offline check, then a fresh shallow clone of the pinned tag into .runes/, rev-parse against the pinned commit, and a byte compare with the clone (also when CI=true, unless --offline)
//   check --local         with RUNES_DIR=<Runes working tree>: a report of how the vendored copy differs from that tree; never a pass (exit 3)
//   update [--tag vX.Y.Z] copy the configured paths from the tag (default: the highest release tag), rewrite the pin, print the changed files and the Runes CHANGELOG between the old and the new tag
//
// Options: --pin <file> (default: $RUNES_PIN, else ./runes.pin.json), --work-dir <dir> (default: <git toplevel>/.runes).
// Exit codes: 0 pass, 1 gate failure, 2 usage or environment error, 3 local report (never green).
//
// The pin (JSON), with every consumer-side path relative to the pin file's directory:
//   source     git URL of Runes
//   tag, commit the vendored release and the commit its tag pointed at when vendored (written by update)
//   dest       directory that holds the copy; files keep their Runes-relative paths under it
//   paths      Runes-relative files or directories to vendor, e.g. "dist/fs", "dist/version.mjs"
//   fragments  [{ name, target, sha256 }]: skills/<name>.md lives in target between <!-- RUNES:<name>:START --> and <!-- RUNES:<name>:END -->
//   tool       { path, sha256 }: where this file itself is vendored
//   files      { <Runes-relative path>: <sha256> } (written by update)

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, posix } from 'node:path';

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;
const EXIT_REPORT = 3;
const TOOL_SOURCE = 'tools/vendor.mjs';

class UsageError extends Error {}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const toPosix = (p) => p.split(sep).join('/');
const out = (s = '') => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);

function parseArgs(argv) {
  const args = { command: argv[0], flags: new Set(), values: {} };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag' || a === '--pin' || a === '--work-dir') {
      if (argv[i + 1] === undefined) throw new UsageError(`${a} needs a value`);
      args.values[a.slice(2)] = argv[++i];
    } else if (a === '--ci' || a === '--offline' || a === '--local') args.flags.add(a.slice(2));
    else throw new UsageError(`unknown argument '${a}'`);
  }
  return args;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
}

// A Runes-relative path from the pin must stay inside the tree it names.
function safeRelative(p, what) {
  if (typeof p !== 'string' || p === '' || p.startsWith('/') || /^[A-Za-z]:/.test(p) || posix.normalize(p).split('/').includes('..') || p.includes('\\')) {
    throw new UsageError(`${what}: '${p}' must be a relative path inside the tree, with forward slashes`);
  }
  return posix.normalize(p).replace(/\/$/, '');
}

function loadPin(pinArg) {
  const pinPath = resolve(pinArg ?? process.env.RUNES_PIN ?? 'runes.pin.json');
  if (!existsSync(pinPath)) throw new UsageError(`pin file not found: ${pinPath}`);
  let pin;
  try {
    pin = JSON.parse(readFileSync(pinPath, 'utf8'));
  } catch (e) {
    throw new UsageError(`pin file ${pinPath} is not valid JSON: ${e.message}`);
  }
  if (typeof pin.source !== 'string' || !pin.source) throw new UsageError('pin: source is required');
  if (typeof pin.dest !== 'string' || !pin.dest || pin.dest === '.') throw new UsageError('pin: dest is required and must name a directory of its own');
  if (!Array.isArray(pin.paths) || pin.paths.length === 0) throw new UsageError('pin: paths must list at least one Runes path');
  pin.paths = pin.paths.map((p) => safeRelative(p, 'pin.paths'));
  pin.fragments = pin.fragments ?? [];
  for (const f of pin.fragments) {
    if (!f || typeof f.name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(f.name)) throw new UsageError('pin.fragments: each needs a name of letters, digits, - or _');
    if (typeof f.target !== 'string' || !f.target) throw new UsageError(`pin.fragments[${f.name}]: target is required`);
  }
  if (pin.tool !== undefined && (typeof pin.tool !== 'object' || typeof pin.tool.path !== 'string')) throw new UsageError('pin.tool: expected { path, sha256 }');
  for (const k of Object.keys(pin.files ?? {})) safeRelative(k, 'pin.files');
  const base = dirname(pinPath);
  return { pin, pinPath, base, destDir: resolve(base, pin.dest) };
}

function isFilled(pin) {
  return typeof pin.tag === 'string' && /^[0-9a-f]{40}$/.test(pin.commit ?? '') && pin.files && typeof pin.files === 'object';
}

function listFiles(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() || e.isSymbolicLink()) found.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return found.map((f) => toPosix(relative(dir, f))).sort();
}

// Every file of the given Runes-relative paths inside a tree (a clone or RUNES_DIR). A path that is absent is an error.
function filesUnder(tree, paths) {
  const files = [];
  for (const p of paths) {
    const full = join(tree, p);
    if (!existsSync(full)) throw new Error(`'${p}' does not exist in ${tree}`);
    if (statSync(full).isDirectory()) files.push(...listFiles(full).map((f) => `${p}/${f}`));
    else files.push(p);
  }
  return [...new Set(files)].sort();
}

const covered = (file, paths) => paths.some((p) => file === p || file.startsWith(`${p}/`));

function markers(name) {
  return { start: `<!-- RUNES:${name}:START -->`, end: `<!-- RUNES:${name}:END -->` };
}

// The text between a fragment's markers: from the line after START up to the start of the END line.
function readBlock(text, name) {
  const { start, end } = markers(name);
  const s = text.indexOf(start);
  if (s === -1 || text.indexOf(start, s + 1) !== -1) return { error: s === -1 ? `no ${start} marker` : `more than one ${start} marker` };
  const e = text.indexOf(end, s);
  if (e === -1 || text.indexOf(end, e + 1) !== -1) return { error: e === -1 ? `no ${end} marker after START` : `more than one ${end} marker` };
  const bodyStart = text.indexOf('\n', s);
  if (bodyStart === -1 || bodyStart >= e) return { error: `${start} must end its line` };
  const lineStart = text.lastIndexOf('\n', e - 1) + 1;
  if (text.slice(lineStart, e).trim() !== '') return { error: `${end} must start its line` };
  return { from: bodyStart + 1, to: lineStart, body: text.slice(bodyStart + 1, lineStart) };
}

function danglingImports(destDir, files) {
  const problems = [];
  const set = new Set(files);
  for (const f of files) {
    if (!/\.(mjs|js)$/.test(f)) continue;
    const text = readFileSync(join(destDir, f), 'utf8');
    const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
    for (const m of text.matchAll(re)) {
      const target = posix.normalize(posix.join(posix.dirname(f), m[1]));
      if (!set.has(target)) problems.push(`${f} imports '${m[1]}', which is not vendored (add ${target} to paths)`);
    }
  }
  return problems;
}

// The offline gate: vendored bytes against the pin. Returns a list of problems.
function offlineProblems(ctx) {
  const { pin, base, destDir } = ctx;
  if (!isFilled(pin)) return ['the pin has no tag, commit or files yet; run update'];
  const problems = [];
  const pinned = Object.keys(pin.files).sort();
  for (const f of pinned) {
    const full = join(destDir, f);
    if (!existsSync(full)) problems.push(`missing: ${pin.dest}/${f}`);
    else if (sha256(readFileSync(full)) !== pin.files[f]) problems.push(`modified: ${pin.dest}/${f} (hand edits are not allowed; change Runes and run update)`);
    if (!covered(f, pin.paths)) problems.push(`pin lists ${f}, which no entry of paths covers`);
  }
  const pinnedSet = new Set(pinned);
  for (const f of listFiles(destDir)) if (!pinnedSet.has(f)) problems.push(`extra: ${pin.dest}/${f} is not in the pin`);
  problems.push(...danglingImports(destDir, pinned.filter((f) => existsSync(join(destDir, f)))));
  for (const frag of pin.fragments) {
    const target = resolve(base, frag.target);
    if (!existsSync(target)) { problems.push(`fragment ${frag.name}: target ${frag.target} does not exist`); continue; }
    const block = readBlock(readFileSync(target, 'utf8'), frag.name);
    if (block.error) problems.push(`fragment ${frag.name} in ${frag.target}: ${block.error}`);
    else if (sha256(block.body) !== frag.sha256) problems.push(`fragment ${frag.name} in ${frag.target}: the block between the markers differs from skills/${frag.name}.md at ${pin.tag}`);
  }
  if (pin.tool) {
    const toolPath = resolve(base, pin.tool.path);
    if (!existsSync(toolPath)) problems.push(`tool: ${pin.tool.path} does not exist`);
    else if (sha256(readFileSync(toolPath)) !== pin.tool.sha256) problems.push(`tool: ${pin.tool.path} differs from ${TOOL_SOURCE} at ${pin.tag}`);
  }
  return problems;
}

function workDir(ctx, flag) {
  if (flag) return resolve(flag);
  let top;
  try {
    top = git(['rev-parse', '--show-toplevel'], ctx.base);
  } catch {
    top = ctx.base;
  }
  return join(top, '.runes');
}

function freshClone(source, tag, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  try {
    git(['-c', 'advice.detachedHead=false', 'clone', '--quiet', '--depth', '1', '--branch', tag, source, dir]);
  } catch (e) {
    throw new Error(`could not clone ${source} at ${tag}: ${(e.stderr || e.message).toString().trim()}`);
  }
  return git(['rev-parse', 'HEAD'], dir);
}

// The CI gate: the pin against a fresh clone of its tag.
function ciProblems(ctx, work) {
  const { pin, base, destDir } = ctx;
  const clone = join(work, 'check');
  const problems = [];
  try {
    const head = freshClone(pin.source, pin.tag, clone);
    if (head !== pin.commit) return [`tag ${pin.tag} of ${pin.source} resolves to ${head}, the pin says ${pin.commit}: the tag moved or the pin was edited`];
    let upstream;
    try {
      upstream = filesUnder(clone, pin.paths);
    } catch (e) {
      return [`paths: ${e.message}`];
    }
    const pinned = Object.keys(pin.files).sort();
    const upstreamSet = new Set(upstream);
    for (const f of upstream) if (!(f in pin.files)) problems.push(`pin misses ${f}, which ${pin.tag} has under paths`);
    for (const f of pinned) {
      if (!upstreamSet.has(f)) { problems.push(`pin lists ${f}, which ${pin.tag} does not have`); continue; }
      const theirs = readFileSync(join(clone, f));
      const vendored = join(destDir, f);
      if (existsSync(vendored) && !readFileSync(vendored).equals(theirs)) problems.push(`differs from ${pin.tag}: ${pin.dest}/${f}`);
      if (sha256(theirs) !== pin.files[f]) problems.push(`pin sha of ${f} does not match ${pin.tag}`);
    }
    for (const frag of pin.fragments) {
      const src = join(clone, 'skills', `${frag.name}.md`);
      if (!existsSync(src)) { problems.push(`fragment ${frag.name}: ${pin.tag} has no skills/${frag.name}.md`); continue; }
      const theirs = readFileSync(src, 'utf8');
      if (sha256(theirs) !== frag.sha256) problems.push(`fragment ${frag.name}: pin sha does not match skills/${frag.name}.md at ${pin.tag}`);
      const target = resolve(base, frag.target);
      const block = existsSync(target) ? readBlock(readFileSync(target, 'utf8'), frag.name) : { error: 'missing' };
      if (!block.error && block.body !== theirs) problems.push(`fragment ${frag.name} in ${frag.target}: differs from skills/${frag.name}.md at ${pin.tag}`);
    }
    if (pin.tool) {
      const theirs = readFileSync(join(clone, TOOL_SOURCE));
      const toolPath = resolve(base, pin.tool.path);
      if (sha256(theirs) !== pin.tool.sha256) problems.push(`tool: pin sha does not match ${TOOL_SOURCE} at ${pin.tag}`);
      if (existsSync(toolPath) && !readFileSync(toolPath).equals(theirs)) problems.push(`tool: ${pin.tool.path} differs from ${TOOL_SOURCE} at ${pin.tag}`);
    }
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
  return problems;
}

function cmdCheck(args) {
  const ctx = loadPin(args.values.pin);
  if (args.flags.has('local')) return localReport(ctx);
  const ci = args.flags.has('ci') || (process.env.CI === 'true' && !args.flags.has('offline'));
  const problems = offlineProblems(ctx);
  if (ci && isFilled(ctx.pin)) problems.push(...ciProblems(ctx, workDir(ctx, args.values['work-dir'])));
  if (problems.length > 0) {
    err(`runes: vendored copy FAILS the gate (${ctx.pin.tag ?? 'no tag'}${ci ? ', against a fresh clone' : ', offline'}):`);
    for (const p of problems) err(`  - ${p}`);
    return EXIT_FAIL;
  }
  const n = Object.keys(ctx.pin.files).length;
  out(`runes: ${n} vendored files, ${ctx.pin.fragments.length} skill fragments${ctx.pin.tool ? ' and the tool' : ''} match ${ctx.pin.tag} (${ctx.pin.commit.slice(0, 12)})${ci ? ', verified against a fresh clone' : ', offline sha check'}.`);
  return EXIT_PASS;
}

function localReport(ctx) {
  const runesDir = process.env.RUNES_DIR;
  if (!runesDir) throw new UsageError('check --local needs RUNES_DIR set to a Runes working tree');
  const tree = resolve(runesDir);
  const { pin, base, destDir } = ctx;
  const lines = [];
  let local;
  try {
    local = filesUnder(tree, pin.paths);
  } catch (e) {
    throw new UsageError(`RUNES_DIR: ${e.message}`);
  }
  const vendored = listFiles(destDir);
  const all = [...new Set([...local, ...vendored])].sort();
  let same = 0;
  for (const f of all) {
    const a = join(destDir, f);
    const b = join(tree, f);
    if (!existsSync(b)) lines.push(`only vendored:    ${f}`);
    else if (!existsSync(a)) lines.push(`only in RUNES_DIR: ${f}`);
    else if (!readFileSync(a).equals(readFileSync(b))) lines.push(`differs:          ${f}`);
    else same++;
  }
  for (const frag of pin.fragments) {
    const src = join(tree, 'skills', `${frag.name}.md`);
    const target = resolve(base, frag.target);
    const block = existsSync(target) ? readBlock(readFileSync(target, 'utf8'), frag.name) : { error: 'target missing' };
    if (!existsSync(src)) lines.push(`fragment ${frag.name}: RUNES_DIR has no skills/${frag.name}.md`);
    else if (block.error) lines.push(`fragment ${frag.name}: ${block.error}`);
    else if (block.body !== readFileSync(src, 'utf8')) lines.push(`fragment ${frag.name}: differs`);
  }
  if (pin.tool && existsSync(join(tree, TOOL_SOURCE)) && existsSync(resolve(base, pin.tool.path)) && !readFileSync(join(tree, TOOL_SOURCE)).equals(readFileSync(resolve(base, pin.tool.path)))) lines.push('tool: differs');
  out(`runes: local report against ${tree} (pin: ${pin.tag ?? 'none'})`);
  out(`  ${same} files identical`);
  for (const l of lines) out(`  ${l}`);
  out('This is a report, not a gate verdict. Only check and check --ci against a tag can pass.');
  return EXIT_REPORT;
}

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v ?? '');
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] } : undefined;
}

function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre < y.pre ? -1 : 1;
}

function latestTag(source) {
  let listing;
  try {
    listing = git(['ls-remote', '--tags', '--refs', source]);
  } catch (e) {
    throw new Error(`could not list tags of ${source}: ${(e.stderr || e.message).toString().trim()}`);
  }
  const tags = listing.split('\n').map((l) => l.split('\trefs/tags/')[1]).filter((t) => t && /^v\d+\.\d+\.\d+$/.test(t)).sort(compareVersions);
  if (tags.length === 0) throw new Error(`${source} has no release tags (vX.Y.Z)`);
  return tags[tags.length - 1];
}

// CHANGELOG sections with a version above `from` and up to `to`.
function changelogBetween(text, from, to) {
  const sections = [];
  let current;
  for (const line of text.split('\n')) {
    const m = /^##\s+\[?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?/.exec(line);
    if (m) {
      current = { version: m[1], lines: [line] };
      sections.push(current);
    } else if (/^##\s/.test(line)) current = undefined;
    else if (current) current.lines.push(line);
  }
  return sections
    .filter((s) => (!from || compareVersions(s.version, from) > 0) && compareVersions(s.version, to) <= 0)
    .map((s) => s.lines.join('\n').trimEnd());
}

function removeEmptyDirs(dir, stopAt) {
  let d = dir;
  while (d.startsWith(stopAt) && d !== stopAt && existsSync(d) && readdirSync(d).length === 0) {
    rmdirSync(d);
    d = dirname(d);
  }
}

function writeFileMkdir(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

function cmdUpdate(args) {
  const ctx = loadPin(args.values.pin);
  const { pin, pinPath, base, destDir } = ctx;
  const tag = args.values.tag ?? latestTag(pin.source);
  if (!parseVersion(tag)) throw new UsageError(`--tag: '${tag}' is not a vX.Y.Z tag`);
  const work = workDir(ctx, args.values['work-dir']);
  const clone = join(work, 'update');
  try {
    const commit = freshClone(pin.source, tag, clone);
    const files = filesUnder(clone, pin.paths);

    // Fragment targets must carry their markers before anything is written, so a failed update leaves the copy untouched.
    const fragmentPlans = pin.fragments.map((frag) => {
      const src = join(clone, 'skills', `${frag.name}.md`);
      if (!existsSync(src)) throw new Error(`fragment ${frag.name}: ${tag} has no skills/${frag.name}.md`);
      const target = resolve(base, frag.target);
      if (!existsSync(target)) throw new Error(`fragment ${frag.name}: target ${frag.target} does not exist`);
      const text = readFileSync(target, 'utf8');
      const block = readBlock(text, frag.name);
      if (block.error) throw new Error(`fragment ${frag.name} in ${frag.target}: ${block.error}; add the marker lines where the fragment belongs`);
      return { frag, target, text, block, body: readFileSync(src, 'utf8') };
    });

    const oldFiles = pin.files ?? {};
    const newFiles = {};
    const changes = [];
    for (const f of files) {
      const data = readFileSync(join(clone, f));
      newFiles[f] = sha256(data);
      if (!(f in oldFiles)) changes.push(`A ${f}`);
      else if (oldFiles[f] !== newFiles[f]) changes.push(`M ${f}`);
      writeFileMkdir(join(destDir, f), data);
    }
    for (const f of Object.keys(oldFiles).sort()) {
      if (f in newFiles) continue;
      changes.push(`D ${f}`);
      rmSync(join(destDir, f), { force: true });
      removeEmptyDirs(dirname(join(destDir, f)), destDir);
    }

    for (const plan of fragmentPlans) {
      const next = plan.text.slice(0, plan.block.from) + plan.body + plan.text.slice(plan.block.to);
      if (next !== plan.text) {
        writeFileSync(plan.target, next);
        changes.push(`F ${plan.frag.name} -> ${plan.frag.target}`);
      }
      plan.frag.sha256 = sha256(plan.body);
    }

    if (pin.tool) {
      const data = readFileSync(join(clone, TOOL_SOURCE));
      const toolPath = resolve(base, pin.tool.path);
      if (!existsSync(toolPath) || !readFileSync(toolPath).equals(data)) changes.push(`T ${pin.tool.path}`);
      writeFileMkdir(toolPath, data);
      pin.tool.sha256 = sha256(data);
    }

    const oldTag = pin.tag;
    const next = { ...pin, tag, commit, files: Object.fromEntries(Object.entries(newFiles).sort(([a], [b]) => (a < b ? -1 : 1))) };
    writeFileSync(pinPath, `${JSON.stringify(next, null, 2)}\n`);

    out(`runes: ${oldTag ?? '(nothing)'} -> ${tag} (${commit.slice(0, 12)})`);
    if (changes.length === 0) out('  no vendored file changed');
    for (const c of changes) out(`  ${c}`);
    const changelogPath = join(clone, 'CHANGELOG.md');
    if (existsSync(changelogPath)) {
      const sections = changelogBetween(readFileSync(changelogPath, 'utf8'), parseVersion(oldTag) ? oldTag : undefined, tag);
      out();
      out(sections.length > 0 ? `Runes CHANGELOG ${oldTag ?? ''}..${tag}:\n\n${sections.join('\n\n')}` : `Runes CHANGELOG has no sections between ${oldTag ?? 'the start'} and ${tag}.`);
    }
    out();
    out('Commit the copy and the pin together, then run check.');
    return EXIT_PASS;
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}

function usage() {
  out('usage: vendor.mjs check [--ci | --offline | --local] [--pin <file>] [--work-dir <dir>]');
  out('       vendor.mjs update [--tag vX.Y.Z] [--pin <file>] [--work-dir <dir>]');
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.command === 'check') return cmdCheck(args);
    if (args.command === 'update') {
      if (args.flags.size > 0) throw new UsageError('update takes only --tag, --pin and --work-dir');
      return cmdUpdate(args);
    }
    if (args.command === undefined || args.command === 'help' || args.command === '--help') {
      usage();
      return args.command === undefined ? EXIT_USAGE : EXIT_PASS;
    }
    throw new UsageError(`unknown command '${args.command}'`);
  } catch (e) {
    if (e instanceof UsageError) {
      err(`runes: ${e.message}`);
      usage();
      return EXIT_USAGE;
    }
    err(`runes: ${e.message}`);
    return args?.command === 'check' ? EXIT_FAIL : EXIT_USAGE;
  }
}

process.exitCode = main(process.argv.slice(2));
