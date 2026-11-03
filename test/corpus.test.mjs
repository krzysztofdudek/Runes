// scripts/corpus.mjs end to end over a throwaway repository fetched through a file:// URL: a golden is made, an edge change makes the gate fail naming the file, the line and the target, an entry in the explanations makes it pass, and a fetch that fails or an entry that does not parse fails the run instead of being skipped. The real corpus never runs here; it runs from npm run corpus.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'corpus.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'runes-corpus-'));
const EMPTY_GITCONFIG = join(tmp, 'gitconfig-empty');
writeFileSync(EMPTY_GITCONFIG, '');
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Runes Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Runes Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG,
};
delete ENV.RUNES_CORPUS_DIR;

const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', ...args], { cwd, env: ENV, encoding: 'utf8' }).trim();
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

let source;
let commit;
let work;

/** One run of the corpus script over the fixture's manifest, goldens, explanations and cache. */
function corpus(command, ...extra) {
  const res = spawnSync(process.execPath, [SCRIPT, command, '--manifest', join(work, 'manifest.json'), '--goldens', join(work, 'goldens'), '--explained', join(work, 'explained.md'), '--cache', join(work, 'cache'), ...extra], { env: ENV, encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

function manifest(repos) {
  writeFileSync(join(work, 'manifest.json'), JSON.stringify({ schema: 'runes-corpus/1', repositories: repos }));
}

const fixture = () => ({ id: 'fixture', url: pathToFileURL(source).href, commit, tier: 'routine' });
const goldenFile = () => join(work, 'goldens', 'fixture.edges');

before(() => {
  source = join(tmp, 'source');
  mkdirSync(source);
  git(source, 'init', '-q');
  put(source, 'app/main.js', "const util = require('../lib/util');\nconst other = require('../lib/other');\nmodule.exports = () => util() + other();\n");
  put(source, 'lib/util.js', 'module.exports = () => 1;\n');
  put(source, 'lib/other.js', 'module.exports = () => 2;\n');
  put(source, 'assets/clip.ts', 'G\0\0\0binary transport stream');
  git(source, 'add', '.');
  git(source, 'commit', '-q', '-m', 'fixture');
  commit = git(source, 'rev-parse', 'HEAD');
  // A second commit the pin does not name: the fetch takes the pinned commit, not the branch tip.
  put(source, 'app/later.js', "require('../lib/util');\n");
  git(source, 'add', '.');
  git(source, 'commit', '-q', '-m', 'later');
});

after(() => rmSync(tmp, { recursive: true, force: true }));

describe('the corpus gate', () => {
  before(() => {
    work = join(tmp, 'work');
    mkdirSync(work);
    manifest([fixture()]);
  });

  test('update writes a golden of the pinned commit: one sorted line per resolved reference, binaries not parsed', () => {
    const r = corpus('update');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /new {2}fixture @[0-9a-f]{10}: 3 files parsed, 1 binary skipped, 2 edges/);
    assert.equal(readFileSync(goldenFile(), 'utf8'), `# runes corpus golden: fixture at ${commit}\napp/main.js:1\tlib/util.js\napp/main.js:2\tlib/other.js\n`);
    assert.ok(readdirSync(join(work, 'cache')).includes(`fixture@${commit}`));
  });

  test('verify passes on an unchanged golden and reuses the fetched clone', () => {
    const r = corpus('verify');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok {3}fixture .*0 added, 0 removed/);
    assert.match(r.out, /corpus verify: passed/);
  });

  test('an edge change the explanations do not cover fails verify and update, naming the file, the line and the target', () => {
    // The golden as an older resolver would have left it: one edge more, one edge fewer.
    writeFileSync(goldenFile(), `# runes corpus golden: fixture at ${commit}\napp/main.js:1\tlib/util.js\napp/main.js:3\tlib/util.js\n`);
    const before = readFileSync(goldenFile(), 'utf8');
    const v = corpus('verify');
    assert.equal(v.code, 1, v.out);
    assert.match(v.out, /UNEXPLAINED \+ app\/main\.js:2 -> lib\/other\.js/);
    assert.match(v.out, /UNEXPLAINED - app\/main\.js:3 -> lib\/util\.js/);
    assert.match(v.out, /corpus verify: FAILED/);
    const u = corpus('update');
    assert.equal(u.code, 1, u.out);
    assert.match(u.out, /the golden is not rewritten while a change is unexplained/);
    assert.equal(readFileSync(goldenFile(), 'utf8'), before);
  });

  test('entries in the explanations make verify pass, and update then rewrites the golden', () => {
    writeFileSync(join(work, 'explained.md'), [
      '# Explained',
      '',
      '```',
      '- `not-a-repository` `+` `x:1` `y`: an example inside a fence is not read',
      '```',
      '',
      '- `fixture` `+` `app/main.js:2` `lib/other.js`: the second require now binds',
      '- `fixture` `-` `app/main.js:*` `lib/util.js`: the stale line is gone',
      '',
    ].join('\n'));
    const v = corpus('verify');
    assert.equal(v.code, 0, v.out);
    assert.match(v.out, /1 added, 1 removed, 2 explained/);
    const u = corpus('update');
    assert.equal(u.code, 0, u.out);
    assert.match(u.out, /upd {2}fixture/);
    assert.equal(readFileSync(goldenFile(), 'utf8'), `# runes corpus golden: fixture at ${commit}\napp/main.js:1\tlib/util.js\napp/main.js:2\tlib/other.js\n`);
  });

  test('an entry that does not parse, gives no reason or names no repository of the manifest fails the run', () => {
    for (const bad of ['- `fixture` `+` `app/main.js` `lib/other.js`: no line', '- `fixture` `+` `app/main.js:2` `lib/other.js`:', '- `elsewhere` `+` `app/main.js:2` `lib/other.js`: unknown', '- `fixture` `?` `app/main.js:2` `lib/other.js`: bad kind']) {
      writeFileSync(join(work, 'explained.md'), `${bad}\n`);
      const r = corpus('verify');
      assert.equal(r.code, 1, `${bad}\n${r.out}`);
      assert.match(r.out, /corpus: explained\.md:1: /);
    }
    writeFileSync(join(work, 'explained.md'), '');
  });

  test('a kind no comparison reports is refused with its line, so a misspelt oracle kind cannot explain nothing', () => {
    writeFileSync(join(work, 'explained.md'), ['# Explained', '', '- `fixture` `typescript:false-edges` `app/main.js:2` `../lib/other` `lib/other.js` `unresolved in the repository`: a misspelt kind', ''].join('\n'));
    const r = corpus('verify');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /corpus: explained\.md:3: no comparison reports the kind 'typescript:false-edges'; it must be \+, - or one of typescript:false-edge, /);
    writeFileSync(join(work, 'explained.md'), '');
  });

  test('an oracle explanation names both answers and stops matching when either of them changes', () => {
    // A `file:` dependency: npm links tools/plug into node_modules and Runes binds it; TypeScript reads no package manager manifest and finds nothing.
    const plugRepo = join(tmp, 'plug');
    mkdirSync(plugRepo);
    git(plugRepo, 'init', '-q');
    put(plugRepo, 'package.json', JSON.stringify({ name: 'app', devDependencies: { plug: 'file:./tools/plug' } }));
    put(plugRepo, 'tools/plug/package.json', JSON.stringify({ name: 'plug', main: 'index.js' }));
    put(plugRepo, 'tools/plug/index.js', 'module.exports = 1;\n');
    put(plugRepo, 'app.js', "const plug = require('plug');\nmodule.exports = plug;\n");
    git(plugRepo, 'add', '.');
    git(plugRepo, 'commit', '-q', '-m', 'plug');
    manifest([{ id: 'plug', url: pathToFileURL(plugRepo).href, commit: git(plugRepo, 'rev-parse', 'HEAD'), tier: 'routine' }]);
    const entry = '- `plug` `typescript:false-edge` `app.js:1` `plug` `tools/plug/index.js` `unresolved in the repository`';
    writeFileSync(join(work, 'explained.md'), '');
    const bare = corpus('oracles');
    assert.equal(bare.code, 1, bare.out);
    // The unexplained disagreement is printed as the entry that would explain it.
    assert.ok(bare.out.includes(`UNEXPLAINED ${entry}\n`), bare.out);
    writeFileSync(join(work, 'explained.md'), `${entry}: a file: dependency npm links and TypeScript does not read\n`);
    const exact = corpus('oracles');
    assert.equal(exact.code, 0, exact.out);
    assert.match(exact.out, /ok {3}plug .*1 disagreements, 1 explained/);
    for (const [changed, moved] of [['`tools/plug/index.js`', '`tools/plug/other.js`'], ['`unresolved in the repository`', '`tools/plug/index.js`']]) {
      writeFileSync(join(work, 'explained.md'), `${entry.replace(changed, moved)}: written for another answer\n`);
      const r = corpus('oracles');
      assert.equal(r.code, 1, `${moved}\n${r.out}`);
      assert.match(r.out, /FAIL plug .*1 disagreements, 0 explained/);
      assert.match(r.out, /1 explanations of plug match no disagreement of this run:\n {4}UNUSED explained\.md:1: /);
    }
    // An oracle entry without its answers is refused, not read as explaining every answer.
    writeFileSync(join(work, 'explained.md'), '- `plug` `typescript:false-edge` `app.js:1` `plug`: no answers\n');
    const short = corpus('oracles');
    assert.equal(short.code, 1, short.out);
    assert.match(short.out, /corpus: explained\.md:1: an oracle entry names both answers it explains after the subject/);
    writeFileSync(join(work, 'explained.md'), '');
    manifest([fixture()]);
  });

  test('a golden made at another commit than the pin fails verify and is replaced by update', () => {
    writeFileSync(goldenFile(), `# runes corpus golden: fixture at ${'0'.repeat(40)}\n`);
    const v = corpus('verify');
    assert.equal(v.code, 1, v.out);
    assert.match(v.out, /the golden was made at 0{40}, the manifest pins/);
    const u = corpus('update', '--only', 'fixture');
    assert.equal(u.code, 0, u.out);
    assert.match(readFileSync(goldenFile(), 'utf8'), new RegExp(`^# runes corpus golden: fixture at ${commit}\n`));
  });

  test('a repository that cannot be fetched fails the run loudly and leaves nothing that looks fetched', () => {
    manifest([fixture(), { id: 'missing', url: pathToFileURL(join(tmp, 'no-such-repository')).href, commit: 'f'.repeat(40), tier: 'routine' }]);
    const r = corpus('verify');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /corpus: fetch of missing \(.*\) failed/);
    assert.ok(!existsSync(join(work, 'cache', `missing@${'f'.repeat(40)}`)));
    manifest([fixture()]);
  });

  test('a manifest pin that is not a full SHA is refused before anything is fetched', () => {
    manifest([{ ...fixture(), commit: commit.slice(0, 12) }]);
    const r = corpus('verify');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /the commit must be a full 40-character SHA/);
    manifest([fixture()]);
  });

  test('--only names a repository of the manifest, and the heavy tier is not run by default', () => {
    manifest([fixture(), { ...fixture(), id: 'heavy-one', tier: 'heavy' }]);
    const unknown = corpus('verify', '--only', 'nope');
    assert.equal(unknown.code, 1, unknown.out);
    assert.match(unknown.out, /--only names no repository of the manifest: nope/);
    const routine = corpus('verify');
    assert.equal(routine.code, 0, routine.out);
    assert.match(routine.out, /corpus verify: 1 repositories/);
    const heavy = corpus('verify', '--tier', 'heavy');
    assert.equal(heavy.code, 1, heavy.out);
    assert.match(heavy.out, /FAIL heavy-one .*no golden yet/);
    manifest([fixture()]);
  });

  test('oracles through a cache reached by a symbolic link (as the temporary directory of macOS is) agree on the fixture as through its real path', () => {
    const real = join(tmp, 'real-cache');
    mkdirSync(real, { recursive: true });
    const linked = join(tmp, 'linked-cache');
    // A junction needs no privilege on Windows; elsewhere the type is ignored.
    symlinkSync(real, linked, 'junction');
    const r = corpus('oracles', '--cache', linked);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok {3}fixture .*checked: typescript 2; 0 disagreements/);
  });

  test('oracles: TypeScript agrees on the fixture, and a skipped oracle is reported as not passed, failing under --strict', () => {
    const r = corpus('oracles');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok {3}fixture .*checked: typescript 2; 0 disagreements/);
    const pyRepo = join(tmp, 'py');
    mkdirSync(pyRepo);
    git(pyRepo, 'init', '-q');
    put(pyRepo, 'pyproject.toml', '[project]\nname = "pkg"\n');
    put(pyRepo, 'pkg/__init__.py', '');
    put(pyRepo, 'pkg/a.py', 'from pkg import b\n');
    put(pyRepo, 'pkg/b.py', 'X = 1\n');
    git(pyRepo, 'add', '.');
    git(pyRepo, 'commit', '-q', '-m', 'py');
    manifest([{ id: 'py', url: pathToFileURL(pyRepo).href, commit: git(pyRepo, 'rev-parse', 'HEAD'), tier: 'routine' }]);
    const noPython = { ...ENV, RUNES_CORPUS_PYTHON: 'runes-corpus-no-such-python' };
    const lax = spawnSync(process.execPath, [SCRIPT, 'oracles', '--manifest', join(work, 'manifest.json'), '--explained', join(work, 'explained.md'), '--cache', join(work, 'cache')], { env: noPython, encoding: 'utf8' });
    assert.equal(lax.status, 0, lax.stdout + lax.stderr);
    assert.match(lax.stdout, /ok {3}py .*checked: python SKIPPED/);
    assert.match(lax.stdout, /SKIPPED, not passed \(1\):\n {2}py python: runes-corpus-no-such-python is not available/);
    assert.match(lax.stdout, /This is not a full oracle run/);
    const strict = spawnSync(process.execPath, [SCRIPT, 'oracles', '--strict', '--manifest', join(work, 'manifest.json'), '--explained', join(work, 'explained.md'), '--cache', join(work, 'cache')], { env: noPython, encoding: 'utf8' });
    assert.equal(strict.status, 1, strict.stdout + strict.stderr);
    assert.match(strict.stdout, /--strict: a skipped oracle fails the run/);
    manifest([fixture()]);
  });
});
