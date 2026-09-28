// Issue 482: a module probe on a case-insensitive file system (macOS, Windows) found lib/root.rs under the name lib/Root.rs and resolved a relation to a file that is not there.
import { describe, it, expect, beforeEach, afterEach } from '../helpers/expect.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { makeExactCaseCheck } from '@chrisdudek/runes/relations';

/** A stand-in case-insensitive, case-preserving file system: `exists` ignores case the way APFS and NTFS do, `readdirSync` lists the stored names. */
function caseInsensitiveFs(files) {
  const stored = files.map((f) => f.split('/'));
  const exists = (rel) => {
    const want = path.posix.normalize(rel).toLowerCase().split('/');
    return stored.some((segs) => want.every((w, i) => segs[i] !== undefined && segs[i].toLowerCase() === w));
  };
  const readdirSync = (abs) => {
    const rel = path.relative('/repo', abs).split(path.sep).join('/');
    const depth = rel === '' ? 0 : rel.split('/').length;
    const prefix = rel === '' ? [] : rel.split('/');
    const names = new Set();
    for (const segs of stored) {
      if (segs.length > depth && prefix.every((p, i) => segs[i] === p)) names.add(segs[depth]);
    }
    if (names.size === 0 && depth > 0) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return [...names];
  };
  return { exists, readdirSync };
}

describe('makeExactCaseCheck', () => {
  it('refuses a probe a case-insensitive file system answers under another spelling', () => {
    const fs = caseInsensitiveFs(['crates/named/lib/root.rs', 'crates/named/Cargo.toml']);
    const exact = makeExactCaseCheck('/repo', fs);
    const probe = (rel) => fs.exists(rel) && exact(rel);
    // The file system alone says yes to both spellings: the false edge of issue 482.
    expect(fs.exists('crates/named/lib/Root.rs')).toBe(true);
    expect(probe('crates/named/lib/Root.rs')).toBe(false);
    expect(probe('Crates/named/lib/root.rs')).toBe(false);
    expect(probe('crates/named/lib/root.rs')).toBe(true);
    expect(probe('crates/named/./lib/../lib/root.rs')).toBe(true);
    expect(probe('crates/named/cargo.toml')).toBe(false);
  });

  it('lists each directory once per instance', () => {
    const fs = caseInsensitiveFs(['a/b.rs', 'a/c.rs']);
    let calls = 0;
    const exact = makeExactCaseCheck('/repo', { readdirSync: (d) => (calls++, fs.readdirSync(d)) });
    exact('a/b.rs');
    exact('a/c.rs');
    exact('a/B.rs');
    expect(calls).toBe(2);
  });

  it('matches a name stored decomposed against a specifier written composed', () => {
    const exact = makeExactCaseCheck('/repo', { readdirSync: () => ['café.rs'] });
    expect(exact('café.rs')).toBe(true);
  });

  it('leaves a path outside the root to the probe', () => {
    const exact = makeExactCaseCheck('/repo', { readdirSync: () => [] });
    expect(exact('../elsewhere/x.rs')).toBe(true);
  });

  describe('on the host file system', () => {
    let root;
    beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'exact-case-'));
      mkdirSync(path.join(root, 'lib'), { recursive: true });
      writeFileSync(path.join(root, 'lib', 'root.rs'), '');
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('tells lib/Root.rs from lib/root.rs whatever the file system does', () => {
      const exact = makeExactCaseCheck(root);
      expect(exact('lib/root.rs')).toBe(true);
      expect(exact('lib/Root.rs')).toBe(false);
      expect(exact('Lib/root.rs')).toBe(false);
    });
  });
});
