// tools/vendor.mjs end to end, against throwaway git repositories: a fake Runes with two release tags and a consumer that vendors from it through a file:// URL.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'vendor.mjs');
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Runes Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Runes Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
};
const BASE_ENV = Object.fromEntries(Object.entries({ ...process.env, ...GIT_ENV }).filter(([k]) => k !== 'CI' && k !== 'RUNES_DIR' && k !== 'RUNES_PIN'));

let tmp;
let runes;
let consumer;
let sourceUrl;

const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'init.defaultBranch=main', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args], { cwd, env: BASE_ENV, encoding: 'utf8' }).trim();
const put = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const read = (rel) => readFileSync(join(consumer, rel), 'utf8');
const pin = () => JSON.parse(read('vendor/runes.pin.json'));
const writePin = (p) => writeFileSync(join(consumer, 'vendor/runes.pin.json'), `${JSON.stringify(p, null, 2)}\n`);
const restore = () => {
  git(consumer, 'checkout', '--', '.');
  git(consumer, 'clean', '-fdq');
};

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
  put(runes, 'CHANGELOG.md', '# Changelog\n\n## [0.1.0] - 2026-09-01\n\n- First release.\n');
  mkdirSync(join(runes, 'tools'));
  copyFileSync(TOOL, join(runes, 'tools/vendor.mjs'));
  git(runes, 'add', '-A');
  git(runes, 'commit', '-qm', 'v0.1.0');
  git(runes, 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0');

  put(runes, 'dist/version.mjs', "export const RUNES_VERSION = '0.2.0';\n");
  put(runes, 'dist/fs/lock.mjs', "export function withLock(fn) { return fn(); }\n");
  put(runes, 'dist/fs/index.mjs', "export { RUNES_VERSION as version } from '../version.mjs';\nexport { withLock } from './lock.mjs';\nexport const subpath = 'fs';\n");
  put(runes, 'skills/worktree.md', 'Work only in your own worktree.\nNever push.\n');
  put(runes, 'CHANGELOG.md', '# Changelog\n\n## [0.2.0] - 2026-09-20\n\n- withLock.\n\n## [0.1.0] - 2026-09-01\n\n- First release.\n');
  git(runes, 'add', '-A');
  git(runes, 'commit', '-qm', 'v0.2.0');
  git(runes, 'tag', '-a', 'v0.2.0', '-m', 'v0.2.0');
  git(runes, 'tag', 'v0.3.0-rc.1');

  mkdirSync(consumer);
  git(consumer, 'init', '-q');
  put(consumer, '.gitignore', '.runes/\n');
  put(consumer, 'SKILL.md', '# Skill\n\nIntro.\n\n<!-- RUNES:worktree:START -->\n<!-- RUNES:worktree:END -->\n\nOutro.\n');
  mkdirSync(join(consumer, 'scripts'));
  copyFileSync(TOOL, join(consumer, 'scripts/runes.mjs'));
  put(consumer, 'vendor/runes.pin.json', `${JSON.stringify({
    source: sourceUrl, dest: 'runes', paths: ['dist/fs', 'dist/version.mjs'], fragments: [{ name: 'worktree', target: '../SKILL.md' }], tool: { path: '../scripts/runes.mjs' },
  }, null, 2)}\n`);
  git(consumer, 'add', '-A');
  git(consumer, 'commit', '-qm', 'consumer');
});

after(() => rmSync(tmp, { recursive: true, force: true }));

describe('vendor.mjs', () => {
  test('check refuses an unfilled pin', () => {
    const r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /run update/);
  });

  test('update --tag copies the paths, fills the fragment, pins the tool and writes the pin', () => {
    const r = run(['update', '--tag', 'v0.1.0']);
    assert.equal(r.code, 0, r.err);
    const p = pin();
    assert.equal(p.tag, 'v0.1.0');
    assert.equal(p.commit, git(runes, 'rev-parse', 'v0.1.0^{commit}'));
    assert.deepEqual(Object.keys(p.files), ['dist/fs/index.d.mts', 'dist/fs/index.mjs', 'dist/version.mjs']);
    assert.equal(read('vendor/runes/dist/fs/index.mjs'), `${git(runes, 'show', 'v0.1.0:dist/fs/index.mjs')}\n`);
    assert.ok(!existsSync(join(consumer, 'vendor/runes/dist/cli')), 'only the configured paths are copied');
    assert.match(read('SKILL.md'), /<!-- RUNES:worktree:START -->\nWork only in your own worktree.\n<!-- RUNES:worktree:END -->\n\nOutro/);
    assert.match(p.tool.sha256, /^[0-9a-f]{64}$/);
    assert.match(r.out, /\(nothing\) -> v0\.1\.0/);
    assert.match(r.out, /A dist\/fs\/index\.mjs/);
    assert.match(r.out, /## \[0\.1\.0\]/);
    assert.ok(!existsSync(join(consumer, '.runes/update')), 'the clone is removed');
    git(consumer, 'add', '-A');
    git(consumer, 'commit', '-qm', 'vendor runes v0.1.0');
  });

  test('check passes offline, without touching the source', () => {
    const p = pin();
    writePin({ ...p, source: 'file:///nonexistent/runes' });
    const r = run(['check']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /3 vendored files, 1 skill fragments and the tool match v0\.1\.0/);
    assert.match(r.out, /offline/);
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

  test('an edited skill fragment or a lost marker fails check', () => {
    writeFileSync(join(consumer, 'SKILL.md'), read('SKILL.md').replace('own worktree', 'own branch'));
    let r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /fragment worktree in \.\.\/SKILL\.md: the block between the markers differs/);
    restore();
    writeFileSync(join(consumer, 'SKILL.md'), read('SKILL.md').replace('<!-- RUNES:worktree:END -->\n', ''));
    r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /no <!-- RUNES:worktree:END --> marker/);
    restore();
  });

  test('an edited copy of the tool itself fails check', () => {
    appendFileSync(join(consumer, 'scripts/runes.mjs'), '// local tweak\n');
    const r = run(['check']);
    assert.equal(r.code, 1);
    assert.match(r.err, /tool: \.\.\/scripts\/runes\.mjs differs/);
    restore();
  });

  test('check --ci passes against a fresh clone and leaves no clone behind', () => {
    mkdirSync(join(consumer, '.runes/check/stale'), { recursive: true });
    const r = run(['check', '--ci']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /verified against a fresh clone/);
    assert.ok(!existsSync(join(consumer, '.runes/check')));
  });

  test('CI=true turns the clone on, and --offline turns it off again', () => {
    writePin({ ...pin(), source: 'file:///nonexistent/runes' });
    let r = run(['check'], { CI: 'true' });
    assert.equal(r.code, 1);
    assert.match(r.err, /could not clone/);
    r = run(['check', '--offline'], { CI: 'true' });
    assert.equal(r.code, 0, r.err);
    restore();
  });

  test('a hand edit laundered into the pin passes offline but fails --ci', () => {
    const f = 'vendor/runes/dist/fs/index.mjs';
    appendFileSync(join(consumer, f), '// quick fix\n');
    const p = pin();
    p.files['dist/fs/index.mjs'] = createHash('sha256').update(readFileSync(join(consumer, f))).digest('hex');
    writePin(p);
    assert.equal(run(['check']).code, 0);
    const r = run(['check', '--ci']);
    assert.equal(r.code, 1);
    assert.match(r.err, /differs from v0\.1\.0: runes\/dist\/fs\/index\.mjs/);
    assert.match(r.err, /pin sha of dist\/fs\/index\.mjs does not match v0\.1\.0/);
    restore();
  });

  test('a pin that drops a file the tag has under paths fails --ci', () => {
    const p = pin();
    delete p.files['dist/fs/index.d.mts'];
    rmSync(join(consumer, 'vendor/runes/dist/fs/index.d.mts'));
    writePin(p);
    assert.equal(run(['check']).code, 0);
    const r = run(['check', '--ci']);
    assert.equal(r.code, 1);
    assert.match(r.err, /pin misses dist\/fs\/index\.d\.mts/);
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
    r = run(['check', '--local'], { RUNES_DIR: runes });
    assert.equal(r.code, 3);
    assert.match(r.out, /differs: +dist\/fs\/index\.mjs/);
    assert.match(r.out, /only in RUNES_DIR: dist\/fs\/lock\.mjs/);
    assert.match(r.out, /fragment worktree: differs/);
    assert.match(r.out, /not a gate verdict/);
  });

  test('update refuses a fragment target without markers and leaves the copy untouched', () => {
    writeFileSync(join(consumer, 'SKILL.md'), '# Skill\n');
    git(consumer, 'commit', '-qam', 'drop markers');
    const r = run(['update', '--tag', 'v0.2.0']);
    assert.equal(r.code, 2);
    assert.match(r.err, /no <!-- RUNES:worktree:START --> marker/);
    assert.equal(pin().tag, 'v0.1.0');
    assert.equal(git(consumer, 'status', '--porcelain'), '');
    git(consumer, 'reset', '-q', '--hard', 'HEAD~1');
  });

  test('update without --tag moves to the highest release tag and prints the changes and the changelog between tags', () => {
    const r = run(['update']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /v0\.1\.0 -> v0\.2\.0/);
    assert.match(r.out, /A dist\/fs\/lock\.mjs/);
    assert.match(r.out, /M dist\/fs\/index\.mjs/);
    assert.match(r.out, /M dist\/version\.mjs/);
    assert.match(r.out, /F worktree -> \.\.\/SKILL\.md/);
    assert.match(r.out, /## \[0\.2\.0\]/);
    assert.doesNotMatch(r.out, /## \[0\.1\.0\]/);
    assert.equal(pin().tag, 'v0.2.0');
    assert.match(read('SKILL.md'), /START -->\nWork only in your own worktree.\nNever push.\n<!-- RUNES:worktree:END/);
    assert.equal(run(['check']).code, 0);
    assert.equal(run(['check', '--ci']).code, 0);
    git(consumer, 'add', '-A');
    git(consumer, 'commit', '-qm', 'vendor runes v0.2.0');
  });

  test('update deletes files the new tag no longer has', () => {
    const p = pin();
    writePin({ ...p, tag: 'v0.2.0' });
    const r = run(['update', '--tag', 'v0.1.0']);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /D dist\/fs\/lock\.mjs/);
    assert.ok(!existsSync(join(consumer, 'vendor/runes/dist/fs/lock.mjs')));
    assert.equal(run(['check']).code, 0);
    restore();
  });

  test('a moved tag fails --ci', () => {
    git(runes, 'tag', '-f', '-a', 'v0.2.0', '-m', 'moved', 'v0.1.0^{commit}');
    const r = run(['check', '--ci']);
    assert.equal(r.code, 1);
    assert.match(r.err, /tag v0\.2\.0 of .* resolves to [0-9a-f]{40}, the pin says [0-9a-f]{40}: the tag moved/);
    assert.equal(run(['check']).code, 0, 'offline the copy still matches its own pin');
  });

  test('a pin path that escapes the tree is a usage error', () => {
    writePin({ ...pin(), paths: ['../secrets'] });
    const r = run(['check']);
    assert.equal(r.code, 2);
    assert.match(r.err, /must be a relative path inside the tree/);
    restore();
  });
});

