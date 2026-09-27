// tools/vendor.mjs end to end: a throwaway Runes git repository with release tags, and a consumer that vendors from it through a file:// URL. Git process starts dominate the run time, so the fixture is built once, the consumer is restored from an in-memory snapshot instead of through git, and clones happen only where a test is about cloning.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync, appendFileSync, readdirSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'vendor.mjs');
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Runes Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Runes Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
};
const BASE_ENV = Object.fromEntries(Object.entries({ ...process.env, ...GIT_ENV }).filter(([k]) => k !== 'CI' && k !== 'RUNES_DIR' && k !== 'RUNES_PIN'));
const SKILL = '# Skill\n\n<!-- RUNES:worktree:START -->\n<!-- RUNES:worktree:END -->\n\nMiddle.\n\n<!-- RUNES:evidence:START -->\n<!-- RUNES:evidence:END -->\n\nOutro.\n';

let tmp;
let runes;
let consumer;
let sourceUrl;
let baseline;

const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'init.defaultBranch=main', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'core.autocrlf=false', ...args], { cwd, env: BASE_ENV, encoding: 'utf8' }).trim();
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const read = (rel) => readFileSync(join(consumer, rel), 'utf8');
const pin = () => JSON.parse(read('vendor/runes.pin.json'));
const writePin = (p) => writeFileSync(join(consumer, 'vendor/runes.pin.json'), `${JSON.stringify(p, null, 2)}\n`);
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');

// The consumer's files (not .git, not .runes) as a map, and a restore that puts exactly those back.
function snapshot() {
  const files = new Map();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === '.runes') continue;
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else files.set(relative(consumer, full), e.isSymbolicLink() ? null : readFileSync(full));
    }
  };
  walk(consumer);
  return files;
}
function restore(to = baseline) {
  for (const [rel] of snapshot()) if (!to.has(rel)) rmSync(join(consumer, rel), { force: true });
  for (const [rel, data] of to) {
    const full = join(consumer, rel);
    if (lstatSync(full, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(full);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
  }
}
const sameAs = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.has(k) && Buffer.compare(v, b.get(k)) === 0);

function run(args, env = {}) {
  const r = spawnSync(process.execPath, [join(consumer, 'scripts/runes.mjs'), ...args, '--pin', 'vendor/runes.pin.json'], { cwd: consumer, env: { ...BASE_ENV, ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'runes-vendor-'));
  runes = join(tmp, 'Runes');
  consumer = join(tmp, 'Consumer');
  sourceUrl = pathToFileURL(runes).href;

  mkdirSync(runes);
  git(runes, 'init', '-q');
  put(runes, 'dist/version.mjs', "export const RUNES_VERSION = '0.1.0';\n");
  put(runes, 'dist/fs/index.mjs', "export { RUNES_VERSION as version } from '../version.mjs';\nexport const subpath = 'fs';\n");
  put(runes, 'dist/fs/index.d.mts', "export { RUNES_VERSION as version } from '../version.mjs';\nexport declare const subpath = \"fs\";\n");
  put(runes, 'dist/cli/index.mjs', "export const subpath = 'cli';\n");
  put(runes, 'skills/worktree.md', 'Work only in your own worktree.\n');
  put(runes, 'skills/evidence.md', 'Record --ran and --saw.');
  put(runes, 'CHANGELOG.md', '# Changelog\n\n## [0.1.0] - 2026-09-01\n\n- First release.\n');
  mkdirSync(join(runes, 'tools'));
  copyFileSync(TOOL, join(runes, 'tools/vendor.mjs'));
  git(runes, 'add', '-A');
  git(runes, 'commit', '-qm', 'v0.1.0');
  git(runes, 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0');

  put(runes, 'dist/version.mjs', "export const RUNES_VERSION = '0.2.0';\n");
  put(runes, 'dist/fs/lock.mjs', 'export function withLock(fn) { return fn(); }\n');
  put(runes, 'dist/fs/index.mjs', "export { RUNES_VERSION as version } from '../version.mjs';\nexport { withLock } from './lock.mjs';\nexport const subpath = 'fs';\n");
  put(runes, 'skills/worktree.md', 'Work only in your own worktree.\nNever push.\n');
  put(runes, 'CHANGELOG.md', '# Changelog\n\n## [0.2.0] - 2026-09-20\n\n- withLock.\n\n## [0.1.0] - 2026-09-01\n\n- First release.\n');
  git(runes, 'add', '-A');
  git(runes, 'commit', '-qm', 'v0.2.0');
  git(runes, 'tag', '-a', 'v0.2.0', '-m', 'v0.2.0');
  git(runes, 'tag', 'v0.3.0-rc.1');

  symlinkSync('index.mjs', join(runes, 'dist/fs/alias.mjs'));
  git(runes, 'add', '-A');
  git(runes, 'commit', '-qm', 'a symbolic link');
  git(runes, 'tag', 'v0.9.0-links');

  // The tool finds the repository root by looking for .git upward; it runs no git in the consumer, so an empty .git directory is enough.
  mkdirSync(join(consumer, '.git'), { recursive: true });
  put(consumer, 'SKILL.md', SKILL);
  mkdirSync(join(consumer, 'scripts'));
  mkdirSync(join(consumer, 'vendor'));
  copyFileSync(TOOL, join(consumer, 'scripts/runes.mjs'));
  writePin({
    source: sourceUrl, dest: 'runes', paths: ['dist/fs', 'dist/version.mjs'],
    fragments: [{ name: 'worktree', target: '../SKILL.md' }, { name: 'evidence', target: '../SKILL.md' }],
    tool: { path: '../scripts/runes.mjs' },
  });
});

after(() => rmSync(tmp, { recursive: true, force: true }));

describe('vendor.mjs', () => {
  test('check refuses an unfilled pin', () => {
    const r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /run update/);
  });

  test('update --tag copies the paths, fills two fragments in one file, pins the tool and writes the pin', () => {
    const r = run(['update', '--tag', 'v0.1.0']);
    assert.equal(r.code, 0, r.err);
    const p = pin();
    assert.equal(p.tag, 'v0.1.0');
    assert.equal(p.commit, git(runes, 'rev-parse', 'v0.1.0^{commit}'));
    assert.deepEqual(Object.keys(p.files), ['dist/fs/index.d.mts', 'dist/fs/index.mjs', 'dist/version.mjs']);
    assert.equal(read('vendor/runes/dist/fs/index.mjs'), `${git(runes, 'show', 'v0.1.0:dist/fs/index.mjs')}\n`);
    assert.ok(!existsSync(join(consumer, 'vendor/runes/dist/cli')), 'only the configured paths are copied');
    assert.equal(read('SKILL.md'), '# Skill\n\n<!-- RUNES:worktree:START -->\nWork only in your own worktree.\n<!-- RUNES:worktree:END -->\n\nMiddle.\n\n<!-- RUNES:evidence:START -->\nRecord --ran and --saw.\n<!-- RUNES:evidence:END -->\n\nOutro.\n');
    assert.deepEqual(p.fragments.map((f) => f.sha256.length), [64, 64]);
    assert.match(p.tool.sha256, /^[0-9a-f]{64}$/);
    assert.match(r.out, /\(nothing\) -> v0\.1\.0 \([0-9a-f]{12}\) from file:/);
    assert.match(r.out, /A dist\/fs\/index\.mjs/);
    assert.match(r.out, /F worktree -> \.\.\/SKILL\.md/);
    assert.match(r.out, /F evidence -> \.\.\/SKILL\.md/);
    assert.match(r.out, /## \[0\.1\.0\]/);
    assert.ok(!existsSync(join(consumer, '.runes/update')), 'the clone is removed');
    baseline = snapshot();
  });

  test('check passes offline, without touching the source, and names the source', () => {
    writePin({ ...pin(), source: 'file:///nonexistent/runes' });
    const r = run(['check']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /3 vendored files, 2 skill fragments and the tool match v0\.1\.0 \([0-9a-f]{12}\) from file:\/\/\/nonexistent\/runes, offline/);
    assert.equal(r.err, '');
    restore();
  });

  test('mutation: a hand-edited vendored file fails check', () => {
    appendFileSync(join(consumer, 'vendor/runes/dist/fs/index.mjs'), '// quick fix\n');
    const r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /modified: runes\/dist\/fs\/index\.mjs/);
    restore();
  });

  test('a missing or an extra vendored file fails check', () => {
    rmSync(join(consumer, 'vendor/runes/dist/fs/index.d.mts'));
    writeFileSync(join(consumer, 'vendor/runes/dist/fs/extra.mjs'), 'export {};\n');
    const r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /missing: runes\/dist\/fs\/index\.d\.mts/);
    assert.match(r.err, /extra: runes\/dist\/fs\/extra\.mjs/);
    restore();
  });

  test('a vendored file checked out with CRLF fails with a .gitattributes hint', () => {
    const f = join(consumer, 'vendor/runes/dist/fs/index.mjs');
    writeFileSync(f, crlf(readFileSync(f, 'utf8')));
    const r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /line endings: runes\/dist\/fs\/index\.mjs was checked out with CRLF; add 'vendor\/runes\/\*\* -text' to \.gitattributes/);
    restore();
  });

  test('symbolic links in the copy fail check', () => {
    rmSync(join(consumer, 'vendor/runes/dist/version.mjs'));
    symlinkSync(join(runes, 'dist/version.mjs'), join(consumer, 'vendor/runes/dist/version.mjs'));
    symlinkSync('index.mjs', join(consumer, 'vendor/runes/dist/fs/alias.mjs'));
    const r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /symlink: runes\/dist\/version\.mjs must be a real file/);
    assert.match(r.err, /symlink: runes\/dist\/fs\/alias\.mjs is not allowed/);
    restore();
  });

  test('an edited fragment, a lost marker, or END before START fails check', () => {
    const cases = [
      [read('SKILL.md').replace('own worktree', 'own branch'), /fragment worktree in \.\.\/SKILL\.md: the block between the markers differs/],
      [read('SKILL.md').replace('<!-- RUNES:evidence:END -->\n', ''), /fragment evidence in \.\.\/SKILL\.md: no <!-- RUNES:evidence:END --> marker/],
      [`<!-- RUNES:worktree:END -->\n${read('SKILL.md').replace('<!-- RUNES:worktree:END -->\n', '')}`, /<!-- RUNES:worktree:END --> comes before <!-- RUNES:worktree:START -->/],
    ];
    for (const [text, expected] of cases) {
      writeFileSync(join(consumer, 'SKILL.md'), text);
      const r = run(['check']);
      assert.equal(r.code, 1);
      assert.match(r.err, expected);
    }
    restore();
  });

  test('a target file with CRLF line endings still passes check', () => {
    writeFileSync(join(consumer, 'SKILL.md'), crlf(read('SKILL.md')));
    const r = run(['check']);
    assert.equal(r.code, 0, r.err);
    restore();
  });

  test('an edited copy of the tool fails check; a pin without a tool entry warns', () => {
    appendFileSync(join(consumer, 'scripts/runes.mjs'), '// local tweak\n');
    let r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /tool: \.\.\/scripts\/runes\.mjs differs/);
    restore();
    const p = pin();
    delete p.tool;
    writePin(p);
    r = run(['check']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /warning: the pin has no tool entry/);
    restore();
  });

  test('pin paths are validated: no absolute paths, no escapes, not the root, never .git', () => {
    const p = pin();
    const bad = [
      { dest: '/abs/runes' }, { dest: '../../outside' }, { dest: '..' }, { dest: 'x/../..' }, { dest: '../.git/x' },
      { paths: ['.'] }, { paths: ['dist/..'] }, { paths: ['../secrets'] }, { paths: ['dist/.git'] }, { paths: ['/etc'] },
      { fragments: [{ name: 'worktree', target: '../../elsewhere/SKILL.md' }] }, { fragments: [{ name: 'worktree', target: '/tmp/SKILL.md' }] },
      { tool: { path: '../../runes.mjs' } }, { source: '--upload-pack=evil' },
    ];
    for (const change of bad) {
      writePin({ ...p, ...change });
      const r = run(['check']);
      assert.equal(r.code, 2, `${JSON.stringify(change)} should be refused:\n${r.err}`);
    }
    restore();
  });

  test('a relative import of a file that is not vendored fails check', () => {
    const p = pin();
    p.paths = ['dist/fs'];
    delete p.files['dist/version.mjs'];
    rmSync(join(consumer, 'vendor/runes/dist/version.mjs'));
    writePin(p);
    const r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /dist\/fs\/index\.mjs imports '\.\.\/version\.mjs', which is not vendored \(add dist\/version\.mjs to paths\)/);
    restore();
  });

  test('check --local reports differences against RUNES_DIR and is never green', () => {
    let r = run(['check', '--local']);
    assert.equal(r.code, 2);
    assert.match(r.err, /RUNES_DIR/);
    git(runes, 'checkout', '-q', 'v0.2.0');
    r = run(['check', '--local'], { RUNES_DIR: runes });
    git(runes, 'checkout', '-q', 'main');
    assert.equal(r.code, 3);
    assert.match(r.out, /differs: +dist\/fs\/index\.mjs/);
    assert.match(r.out, /only in RUNES_DIR: dist\/fs\/lock\.mjs/);
    assert.match(r.out, /fragment worktree: differs/);
    assert.doesNotMatch(r.out, /fragment evidence/);
    assert.match(r.out, /not a gate verdict/);
  });

  test('check --ci passes against a fresh clone; CI=true turns it on, --offline off', () => {
    mkdirSync(join(consumer, '.runes/check/stale'), { recursive: true });
    let r = run(['check', '--ci']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /verified against a fresh clone/);
    assert.ok(!existsSync(join(consumer, '.runes/check')));
    writePin({ ...pin(), source: 'file:///nonexistent/runes' });
    r = run(['check'], { CI: 'true' });
    assert.equal(r.code, 1);
    assert.match(r.err, /could not clone/);
    r = run(['check', '--offline'], { CI: 'true' });
    assert.equal(r.code, 0, r.err);
    restore();
  });

  test('a hand edit laundered into the pin, or a file dropped from it, passes offline but fails --ci', () => {
    const f = 'vendor/runes/dist/fs/index.mjs';
    appendFileSync(join(consumer, f), '// quick fix\n');
    const p = pin();
    p.files['dist/fs/index.mjs'] = createHash('sha256').update(readFileSync(join(consumer, f))).digest('hex');
    delete p.files['dist/fs/index.d.mts'];
    rmSync(join(consumer, 'vendor/runes/dist/fs/index.d.mts'));
    writePin(p);
    assert.equal(run(['check']).code, 0);
    const r = run(['check', '--ci']);
    assert.equal(r.code, 1);
    assert.match(r.err, /differs from v0\.1\.0: runes\/dist\/fs\/index\.mjs/);
    assert.match(r.err, /pin sha of dist\/fs\/index\.mjs does not match v0\.1\.0/);
    assert.match(r.err, /pin misses dist\/fs\/index\.d\.mts/);
    restore();
  });

  test('update refuses a fragment target without markers before cloning, and leaves everything untouched', () => {
    writeFileSync(join(consumer, 'SKILL.md'), '# Skill\n<!-- RUNES:worktree:START -->\n<!-- RUNES:worktree:END -->\n');
    const before = snapshot();
    const r = run(['update', '--tag', 'v0.2.0']);
    assert.equal(r.code, 2);
    assert.match(r.err, /fragment evidence in \.\.\/SKILL\.md: no <!-- RUNES:evidence:START --> marker/);
    assert.doesNotMatch(r.err, /clone/);
    assert.ok(sameAs(before, snapshot()));
    restore();
  });

  test('update refuses a tag whose paths hold a symbolic link, and leaves everything untouched', () => {
    const r = run(['update', '--tag', 'v0.9.0-links']);
    assert.equal(r.code, 2);
    assert.match(r.err, /'dist\/fs\/alias\.mjs' is a symbolic link/);
    assert.ok(sameAs(baseline, snapshot()));
  });

  test('update without --tag moves to the highest release tag, keeps CRLF in the target, and prints the changes and the changelog', () => {
    writeFileSync(join(consumer, 'SKILL.md'), crlf(read('SKILL.md')));
    const r = run(['update']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /v0\.1\.0 -> v0\.2\.0/);
    assert.match(r.out, /A dist\/fs\/lock\.mjs/);
    assert.match(r.out, /M dist\/fs\/index\.mjs/);
    assert.match(r.out, /M dist\/version\.mjs/);
    assert.match(r.out, /F worktree -> \.\.\/SKILL\.md/);
    assert.doesNotMatch(r.out, /F evidence/);
    assert.match(r.out, /## \[0\.2\.0\]/);
    assert.doesNotMatch(r.out, /## \[0\.1\.0\]/);
    assert.equal(pin().tag, 'v0.2.0');
    const skill = read('SKILL.md');
    assert.match(skill, /START -->\r\nWork only in your own worktree.\r\nNever push.\r\n<!-- RUNES:worktree:END/);
    assert.doesNotMatch(skill, /[^\r]\n/, 'every line ending stays CRLF');
    assert.equal(run(['check']).code, 0);
    assert.equal(run(['check', '--ci']).code, 0);
  });

  test('update deletes files the new tag no longer has', () => {
    const r = run(['update', '--tag', 'v0.1.0']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /D dist\/fs\/lock\.mjs/);
    assert.ok(!existsSync(join(consumer, 'vendor/runes/dist/fs/lock.mjs')));
    assert.equal(run(['check']).code, 0);
  });

  test('a moved tag fails --ci', () => {
    git(runes, 'tag', '-f', '-a', 'v0.1.0', '-m', 'moved', 'v0.2.0^{commit}');
    const r = run(['check', '--ci']);
    assert.equal(r.code, 1);
    assert.match(r.err, /tag v0\.1\.0 of .* resolves to [0-9a-f]{40}, the pin says [0-9a-f]{40}: the tag moved/);
    assert.equal(run(['check']).code, 0, 'offline the copy still matches its own pin');
  });
});
