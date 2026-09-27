import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, utimesSync, realpathSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import {
  withLock, withLockAsync, lockIsStale, lockHolderText, pidRuns, LockHeldError, LockDirectoryMissingError,
  writeAtomic, renameWithRetry, transientRenameCodes, tempPathFor,
  findRoot, checkoutRoot, mainCheckout, gitCommonDir, isLinkedWorktree,
} from '@chrisdudek/runes/fs';

const temp = () => realpathSync(mkdtempSync(join(tmpdir(), 'runes-fs-')));
const deadPid = () => { const r = spawnSync(process.execPath, ['-e', '0']); return r.pid; };
const old = (path, ms) => { const t = (Date.now() - ms) / 1000; utimesSync(path, t, t); };

describe('withLock', () => {
  test('runs fn, returns its value, and leaves no lock behind', () => {
    const dir = temp();
    try {
      const lock = join(dir, '.lock');
      assert.equal(withLock(lock, () => { assert.ok(existsSync(lock)); return readFileSync(lock, 'utf8'); }).split(' ')[0], String(process.pid));
      assert.equal(existsSync(lock), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('is re-entrant for one path and releases only when the outermost call ends; releases on throw', () => {
    const dir = temp();
    try {
      const lock = join(dir, '.lock');
      withLock(lock, () => withLock(lock, () => assert.ok(existsSync(lock))));
      assert.equal(existsSync(lock), false);
      assert.throws(() => withLock(lock, () => { throw new Error('boom'); }), /boom/);
      assert.equal(existsSync(lock), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a live holder that does not let go fails with LockHeldError naming it, and nothing runs', () => {
    const dir = temp();
    try {
      const lock = join(dir, '.lock');
      writeFileSync(lock, lockHolderText(process.pid));   // this process is alive: the lock is live
      let ran = false;
      assert.throws(() => withLock(lock, () => { ran = true; }, { waitMs: 150 }), (e) => e instanceof LockHeldError && e.code === 'ELOCKED' && e.message.includes(String(process.pid)));
      assert.equal(ran, false);
      assert.ok(existsSync(lock), 'a live lock is never removed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a lock whose holder died on this host is broken and taken over at once', () => {
    const dir = temp();
    try {
      const lock = join(dir, '.lock');
      writeFileSync(lock, lockHolderText(deadPid()));
      assert.equal(withLock(lock, () => 'ran', { waitMs: 1000 }), 'ran');
      assert.equal(existsSync(lock), false);
      assert.equal(existsSync(`${lock}.break`), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('an empty lock and one from another host are stale only after their age limits', () => {
    const now = Date.now();
    assert.equal(lockIsStale('', now - 100, {}, now), false);
    assert.equal(lockIsStale('', now - 3000, {}, now), true);
    const other = lockHolderText(1, 'some-other-host');
    assert.equal(lockIsStale(other, now - 1000, {}, now), false);
    assert.equal(lockIsStale(other, now - 31_000, {}, now), true);
    assert.equal(lockIsStale(other, now - 1000, { staleMs: 500 }, now), true);
    assert.equal(lockIsStale(lockHolderText(process.pid), now - 60_000, {}, now), false, 'a live pid on this host');
    assert.equal(lockIsStale(lockHolderText(process.pid), now - 11 * 60_000, {}, now), true, 'against pid reuse');
    assert.equal(lockIsStale(lockHolderText(deadPid(), hostname()), now, {}, now), true);
  });

  test('a stale lock from another host is taken over; a breaker left behind by a dead breaker is cleared', () => {
    const dir = temp();
    try {
      const lock = join(dir, '.lock');
      writeFileSync(lock, lockHolderText(1, 'elsewhere'));
      old(lock, 60_000);
      writeFileSync(`${lock}.break`, lockHolderText(1, 'elsewhere'));
      old(`${lock}.break`, 60_000);
      assert.equal(withLock(lock, () => 'ran', { waitMs: 2000 }), 'ran');
      assert.equal(existsSync(`${lock}.break`), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a missing directory is LockDirectoryMissingError, and nothing runs', () => {
    const dir = temp();
    try {
      let ran = false;
      assert.throws(() => withLock(join(dir, 'gone', '.lock'), () => { ran = true; }), (e) => e instanceof LockDirectoryMissingError && e.code === 'ENOENT');
      assert.equal(ran, false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('on Windows, a lock file that refuses to open with EPERM is waited out, not an error', () => {
    // Simulated: the platform knob only changes which codes count as transient, so a held lock still times out as held.
    const dir = temp();
    try {
      const lock = join(dir, '.lock');
      writeFileSync(lock, lockHolderText(process.pid));
      assert.throws(() => withLock(lock, () => 0, { waitMs: 50, platform: 'win32' }), LockHeldError);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('eight processes incrementing one counter under the lock lose no update', async () => {
    const dir = temp();
    try {
      const counter = join(dir, 'n');
      writeFileSync(counter, '0');
      const script = `
        import { withLock } from '@chrisdudek/runes/fs';
        import { readFileSync, writeFileSync } from 'node:fs';
        const [lock, file] = process.argv.slice(1);   // -e has no script path in argv
        for (let i = 0; i < 25; i += 1) withLock(lock, () => {
          const n = Number(readFileSync(file, 'utf8'));
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
          writeFileSync(file, String(n + 1));
        });`;
      const runs = Array.from({ length: 8 }, () => new Promise((res, rej) => {
        const c = spawn(process.execPath, ['--input-type=module', '-e', script, join(dir, '.lock'), counter], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        c.stderr.on('data', (d) => { err += d; });
        c.on('close', (code) => (code === 0 ? res() : rej(new Error(err))));
      }));
      await Promise.all(runs);
      assert.equal(readFileSync(counter, 'utf8'), '200');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('withLockAsync', () => {
  test('two calls in one process take turns, and the lock is released after each', async () => {
    const dir = temp();
    try {
      const lock = join(dir, '.lock');
      const order = [];
      const one = (name) => withLockAsync(lock, async () => { order.push(`${name}+`); await new Promise((r) => setTimeout(r, 30)); order.push(`${name}-`); return name; });
      assert.deepEqual(await Promise.all([one('a'), one('b')]), ['a', 'b']);
      assert.ok(order.join(' ') === 'a+ a- b+ b-' || order.join(' ') === 'b+ b- a+ a-', order.join(' '));
      assert.equal(existsSync(lock), false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a live holder fails the wait', async () => {
    const dir = temp();
    try {
      const lock = join(dir, '.lock');
      writeFileSync(lock, lockHolderText(process.pid));
      await assert.rejects(withLockAsync(lock, () => 1, { waitMs: 100 }), LockHeldError);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

test('pidRuns: this process runs, a finished one does not, nonsense does not', () => {
  assert.equal(pidRuns(process.pid), true);
  assert.equal(pidRuns(deadPid()), false);
  assert.equal(pidRuns(0), false);
  assert.equal(pidRuns(-5), false);
});

describe('writeAtomic', () => {
  test('creates and replaces a file whole, leaving no temporary file', () => {
    const dir = temp();
    try {
      const f = join(dir, 'a.json');
      writeAtomic(f, 'one');
      writeAtomic(f, Buffer.from('two'));
      assert.equal(readFileSync(f, 'utf8'), 'two');
      assert.deepEqual(readdirSync(dir), ['a.json']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('a failed rename removes the temporary file and throws', () => {
    const dir = temp();
    try {
      const f = join(dir, 'a');
      const fail = () => { const e = new Error('nope'); e.code = 'EXDEV'; throw e; };
      assert.throws(() => writeAtomic(f, 'x', { rename: fail }), /nope/);
      assert.deepEqual(readdirSync(dir), []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('the temporary name is hidden, beside the target, unique, and ends in .tmp', () => {
    const a = tempPathFor(join('d', 'x.md'));
    assert.match(a, new RegExp(`^d[\\\\/]\\.x\\.md\\.${process.pid}\\.[0-9a-f]{8}\\.tmp$`));
    assert.notEqual(a, tempPathFor(join('d', 'x.md')));
  });
});

describe('renameWithRetry', () => {
  const flaky = (code, times) => {
    let n = 0;
    const fn = () => { n += 1; if (n <= times) { const e = new Error(code); e.code = code; throw e; } };
    fn.calls = () => n;
    return fn;
  };

  test('on Windows, EPERM, EACCES and EBUSY are retried until the rename goes through', () => {
    for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
      const r = flaky(code, 3);
      renameWithRetry('a', 'b', { platform: 'win32', rename: r });
      assert.equal(r.calls(), 4, code);
    }
  });

  test('elsewhere only EBUSY is retried; EPERM is let through at once', () => {
    const r = flaky('EPERM', 1);
    assert.throws(() => renameWithRetry('a', 'b', { platform: 'linux', rename: r }), /EPERM/);
    assert.equal(r.calls(), 1);
    assert.deepEqual([...transientRenameCodes('darwin')], ['EBUSY']);
  });

  test('a failure that outlasts the budget is let through', () => {
    const r = flaky('EBUSY', Infinity);
    const t = Date.now();
    assert.throws(() => renameWithRetry('a', 'b', { platform: 'win32', budgetMs: 60, rename: r }), /EBUSY/);
    assert.ok(Date.now() - t < 1000);
    assert.ok(r.calls() > 1);
  });

  test('replaces an existing file on this platform', () => {
    const dir = temp();
    try {
      writeFileSync(join(dir, 'a'), 'new');
      writeFileSync(join(dir, 'b'), 'old');
      renameWithRetry(join(dir, 'a'), join(dir, 'b'));
      assert.equal(readFileSync(join(dir, 'b'), 'utf8'), 'new');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('root discovery', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' } }).toString();

  test('the nearest checkout, its main checkout through the common dir, and the marker rule', () => {
    const base = temp();
    try {
      const main = join(base, 'main');
      mkdirSync(join(main, 'src', 'deep'), { recursive: true });
      git(base, 'init', '-q', main);
      git(main, 'commit', '-q', '--allow-empty', '-m', 'init');
      const wt = join(base, 'wt');
      git(main, 'worktree', 'add', '-q', wt);
      mkdirSync(join(wt, 'sub'));

      assert.equal(checkoutRoot(join(main, 'src', 'deep')), main);
      assert.equal(checkoutRoot(join(wt, 'sub')), wt);
      assert.equal(isLinkedWorktree(wt), true);
      assert.equal(isLinkedWorktree(main), false);
      assert.equal(gitCommonDir(wt), join(main, '.git'));
      assert.equal(mainCheckout(wt), main);
      assert.equal(mainCheckout(main), main);

      assert.equal(findRoot(join(wt, 'sub')), wt, 'no marker: the nearest checkout');
      assert.equal(findRoot(join(wt, 'sub'), { marker: '.state' }), wt, 'nobody has the marker');
      mkdirSync(join(main, '.state'));
      assert.equal(findRoot(join(wt, 'sub'), { marker: '.state' }), main, 'only the main checkout has it');
      mkdirSync(join(wt, '.state'));
      assert.equal(findRoot(join(wt, 'sub'), { marker: '.state' }), wt, 'the worktree has its own');
      assert.equal(findRoot(join(main, 'src'), { marker: '.state' }), main);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test('outside any checkout: the directory itself, and no common dir', () => {
    const dir = temp();
    try {
      const outside = checkoutRoot(dir);
      if (outside === null) {
        assert.equal(findRoot(dir), dir);
        assert.equal(gitCommonDir(dir), null);
        assert.equal(mainCheckout(dir), null);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
