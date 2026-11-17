// Every Rust case of the catalogue is a crate (or a workspace) that rustc reads, so a case cannot pass for a reason no compiler agrees with. This builds each one with `cargo check --offline` under the pinned toolchain, in a throwaway directory, with stub crates in place of every registry and git dependency (test/helpers/rust-fixtures.mjs), and checks that rustc read every `.rs` file of the case, from the dep-info files the build writes: a file no crate root reaches through `mod` is never compiled, so a build that passes says nothing of the edge the case expects for it. Where that toolchain is missing or of another version the test is skipped with the reason, except on CI, where the workflow installs it and the test fails instead (rustToolchainVerdict).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listCases, loadCaseDoc } from './reference-case-runner.mjs';
import { PINNED_RUST, cargoConfig, rustToolchainVerdict, writeRustFixture } from '../helpers/rust-fixtures.mjs';

const PINNED = PINNED_RUST;

const toolchain = (tool) => {
  const r = spawnSync(tool, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : undefined;
};
const rustc = toolchain('rustc');
const cargo = toolchain('cargo');
const verdict = rustToolchainVerdict({ rustc, cargo, pinned: PINNED, ci: process.env.CI === 'true' });
const skip = verdict.skip;

/** The cases that do not build: one file that is unparsable on purpose, which no compiler reads. Every other case builds, and the test below says when a listed one does, so this list only shrinks. */
const DO_NOT_BUILD_YET = new Set([
  'rust-module-of-unparsable-lib-root-item-edge',
]);

/** The files a case keeps out of the build on purpose, by case, each with the reason: rustc reads every other `.rs` file of a case that builds. The test below fails when rustc reads a file listed here, so this list only shrinks. */
const KEPT_OUT_OF_THE_BUILD = new Map([
]);

// One folder holds everything the builds write: the cases, the build output and a cargo home of its own, so the developer's cargo folder is never touched; it is removed when the tests end.
const work = skip === false && verdict.fail === undefined ? mkdtempSync(path.join(tmpdir(), 'runes-rust-cases-')) : undefined;
after(() => {
  if (work !== undefined) rmSync(work, { recursive: true, force: true });
});

/** The `.rs` files of a case that a build did not read, as the case writes their paths: every one the dep-info files under `target` do not name. A dep-info file lists, after the `: ` of its first rule, the source files rustc read for one crate, a space inside a name escaped as `\ `; a relative name is relative to the workspace root rustc ran in, the directory of `manifest` or one above it inside `root`, and is read against the first of those where the file exists. */
export function unreadFiles(target, root, manifest, files) {
  const roots = [root, realpathSync(root)];
  const bases = [];
  for (let dir = path.dirname(path.join(root, manifest)); ; dir = path.dirname(dir)) {
    bases.push(dir);
    if (path.relative(root, dir) === '' || path.relative(root, dir).startsWith('..')) break;
  }
  const read = new Set();
  for (const entry of readdirSync(target, { recursive: true })) {
    if (!String(entry).endsWith('.d')) continue;
    for (const line of readFileSync(path.join(target, String(entry)), 'utf8').split(/\r?\n/)) {
      const colon = line.indexOf(': ');
      if (line.startsWith('#') || colon < 0) continue;
      for (const token of line.slice(colon + 2).split(/(?<!\\)\s+/)) {
        if (token === '') continue;
        const name = token.replace(/\\ /g, ' ');
        const file = path.isAbsolute(name) ? name : bases.map((b) => path.join(b, name)).find((c) => existsSync(c));
        for (const r of file === undefined ? [] : roots) {
          const rel = path.relative(r, file);
          if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) read.add(rel.split(path.sep).join('/'));
        }
      }
    }
  }
  return files.filter((f) => f.path.endsWith('.rs') && !read.has(f.path)).map((f) => f.path);
}

function build(id) {
  const doc = loadCaseDoc(id, listCases().find((c) => c.id === id).mdPath);
  const root = mkdtempSync(path.join(work, 'case-'));
  // A target directory of the build's own, so that every dep-info file in it is one this build wrote.
  const target = mkdtempSync(path.join(work, 'target-'));
  try {
    const manifest = writeRustFixture(root, [...doc.files, ...doc.configFiles]);
    // The target directory goes on the command line, which a wrapper that runs cargo elsewhere passes on as it does every argument.
    const run = spawnSync('cargo', ['check', '--offline', '--all-targets', '--workspace', '--target-dir', target, '--manifest-path', path.join(root, manifest)], { cwd: root, encoding: 'utf8', env: { ...process.env, CARGO_HOME: path.join(work, 'cargo-home') } });
    const ok = run.status === 0;
    return { ok, output: `${run.stderr}${run.stdout}`, unread: ok ? unreadFiles(target, root, manifest, doc.files) : [] };
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
}

const rustCases = listCases().filter((c) => c.language === 'rust').map((c) => c.id);

test('every Rust case of the catalogue builds under the pinned toolchain, except the ones listed as not building yet, and rustc reads each of its files, except the ones the case keeps out of the build', { skip, timeout: 900000 }, () => {
  if (verdict.fail !== undefined) assert.fail(verdict.fail);
  const built = rustCases.filter((id) => !DO_NOT_BUILD_YET.has(id)).map((id) => ({ id, ...build(id) }));
  const broken = built.filter((r) => !r.ok);
  assert.deepEqual(broken.map((b) => `${b.id}: ${b.output.split('\n').filter((l) => /^error/.test(l)).slice(0, 2).join(' | ')}`), []);
  const kept = (id) => KEPT_OUT_OF_THE_BUILD.get(id) ?? new Map();
  assert.deepEqual(built.flatMap((r) => r.unread.filter((f) => !kept(r.id).has(f)).map((f) => `${r.id}: ${f}`)), [], 'rustc read none of these files: declare them where the case means them to be compiled, or name them in KEPT_OUT_OF_THE_BUILD with the reason');
  assert.deepEqual(built.flatMap((r) => [...kept(r.id).keys()].filter((f) => !r.unread.includes(f)).map((f) => `${r.id}: ${f}`)), [], 'rustc reads these files now: take them out of KEPT_OUT_OF_THE_BUILD');
});

test('a Rust case that keeps a file out of the build names a file of its own, and builds', () => {
  for (const [id, files] of KEPT_OUT_OF_THE_BUILD) {
    assert.ok(rustCases.includes(id), `${id} is no Rust case`);
    assert.ok(!DO_NOT_BUILD_YET.has(id), `${id} does not build, so no file of it is read`);
    const doc = loadCaseDoc(id, listCases().find((c) => c.id === id).mdPath);
    for (const [file, why] of files) {
      assert.ok(doc.files.some((f) => f.path === file && file.endsWith('.rs')), `${id} has no Rust file ${file}`);
      assert.ok(why.length > 0, `${id}: ${file} keeps no reason`);
    }
  }
});

// The dep-info files rustc writes name the files of the crates under the workspace root relative to it, others whole, and the names of the stub crates' files, which are no files of the case, end like them.
test('the files of a case that no dep-info file of the build names are the files rustc did not read', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'runes-rust-dep-info-'));
  try {
    const root = path.join(dir, 'case');
    const target = path.join(dir, 'target');
    for (const f of ['Cargo.toml', 'src/lib.rs', 'src/a b.rs', 'src/orphan.rs', 'inner/Cargo.toml', 'inner/src/lib.rs', 'inner/src/stray.rs', '.stubs/kit/src/orphan.rs']) {
      mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      writeFileSync(path.join(root, f), '');
    }
    mkdirSync(path.join(target, 'debug', 'deps'), { recursive: true });
    writeFileSync(path.join(target, 'debug', 'deps', 'app-1.d'), `${path.join(target, 'debug', 'deps', 'app-1.d')}: src/lib.rs src/a\\ b.rs\n\nsrc/lib.rs:\n# env-dep:CARGO_PKG_NAME=app\n`);
    writeFileSync(path.join(target, 'debug', 'deps', 'inner-1.d'), `x: inner/src/lib.rs ${path.join(root, '.stubs', 'kit', 'src', 'orphan.rs').replace(/ /g, '\\ ')}\r\n`);
    writeFileSync(path.join(target, 'debug', 'deps', 'libapp.rmeta'), 'src/orphan.rs: src/orphan.rs');
    const files = ['Cargo.toml', 'src/lib.rs', 'src/a b.rs', 'src/orphan.rs', 'inner/src/lib.rs', 'inner/src/stray.rs'].map((p) => ({ path: p, code: '' }));
    assert.deepEqual(unreadFiles(target, root, 'Cargo.toml', files), ['src/orphan.rs', 'inner/src/stray.rs']);
    // From a manifest below the case root, a relative name is read against the manifest's directory first, where `src/lib.rs` exists as it does at the root.
    const below = path.join(dir, 'target-below');
    mkdirSync(below);
    writeFileSync(path.join(below, 'inner-2.d'), 'y: src/lib.rs\n');
    assert.deepEqual(unreadFiles(below, root, 'inner/Cargo.toml', files.filter((f) => f.path.startsWith('inner/'))), ['inner/src/stray.rs']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a Rust case listed as not building yet still does not build, and names a case of the catalogue', { skip, timeout: 900000 }, () => {
  if (verdict.fail !== undefined) assert.fail(verdict.fail);
  const stale = [];
  for (const id of DO_NOT_BUILD_YET) {
    assert.ok(rustCases.includes(id), `${id} is no Rust case`);
    if (build(id).ok) stale.push(id);
  }
  assert.deepEqual(stale, [], 'these cases build now: take them out of DO_NOT_BUILD_YET');
});

/** The text of a TOML basic string (`"…"`) as Cargo's TOML reader takes it: a backslash starts one of `\b \t \n \f \r \" \\ \uXXXX \UXXXXXXXX`, any other escape is an error, and so is a control character or a quote left unescaped. */
function tomlBasicString(text) {
  assert.ok(text.length >= 2 && text.startsWith('"') && text.endsWith('"'), `not a basic string: ${text}`);
  let out = '';
  for (let i = 1; i < text.length - 1; i++) {
    const ch = text[i];
    if (ch === '"' || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(ch)) throw new SyntaxError(`${JSON.stringify(ch)} must be escaped, at ${i} of ${text}`);
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const e = text[++i];
    const simple = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' }[e];
    if (simple !== undefined) {
      out += simple;
      continue;
    }
    const width = e === 'u' ? 4 : e === 'U' ? 8 : 0;
    const hex = text.slice(i + 1, i + 1 + width);
    if (width === 0 || !new RegExp(`^[0-9A-Fa-f]{${width}}$`).test(hex)) throw new SyntaxError(`invalid escape \\${e}${hex}, at ${i} of ${text}`);
    out += String.fromCodePoint(parseInt(hex, 16));
    i += width;
  }
  return out;
}

// Cargo reads .cargo/config.toml as TOML, where a backslash in a double-quoted string starts an escape: a Windows path written there as it stands (`C:\Users\…`) is refused (`\U` wants eight hex digits) and Cargo stops with "could not load Cargo configuration", or it is read as another path (`\r` is a carriage return).
test('the Cargo configuration of the stub crates keeps the stub directory as it is on every platform, a Windows path included', () => {
  const externals = [{ name: 'kit', versions: new Set(['1.0.0']), gits: new Set(['https://example.com/kit.git']), registries: new Set(['inner']) }];
  for (const stubs of [
    String.raw`C:\Users\RUNNER~1\AppData\Local\Temp\runes-rust-cases-d1pwrM\case-8oUoUd\.stubs`,
    String.raw`D:\a\Runes\Runes\tmp\runes-rust-cases-x\case-y\.stubs`,
    '/tmp/runes-rust-cases-x/case-y/.stubs',
    '/home/o"brien/a b/.stubs',
  ]) {
    const values = new Map();
    let table = '';
    for (const line of cargoConfig(stubs, externals).split('\n')) {
      const header = /^\[([^\]]+)\]$/.exec(line);
      if (header) table = header[1];
      const kv = /^([\w-]+) = (.*)$/.exec(line);
      if (kv) values.set(`${table}.${kv[1]}`, tomlBasicString(kv[2]));
    }
    assert.equal(values.get('source.stubs.directory'), stubs);
    assert.equal(values.get('source.crates-io.replace-with'), 'stubs');
    assert.equal(values.get('source.git0.git'), 'https://example.com/kit.git');
    assert.equal(values.get('registries.inner.index'), 'sparse+https://inner.example/index/');
  }
});

test('the Rust build tests fail on CI where the pinned toolchain is missing or differs, and are skipped with the reason elsewhere', () => {
  const pinned = '1.99.1';
  const found = { rustc: 'rustc 1.99.1 (aaaaaaaaa 2026-10-01)', cargo: 'cargo 1.99.1 (bbbbbbbbb 2026-09-20)' };
  const newer = { rustc: 'rustc 1.100.0 (ccccccccc 2026-11-12)', cargo: 'cargo 1.100.0 (ddddddddd 2026-11-01)' };
  for (const ci of [false, true]) assert.deepEqual(rustToolchainVerdict({ ...found, pinned, ci }), { skip: false, fail: undefined });
  for (const toolchain of [{}, { rustc: found.rustc }, { cargo: found.cargo }, newer, { rustc: found.rustc, cargo: newer.cargo }]) {
    const local = rustToolchainVerdict({ ...toolchain, pinned, ci: false });
    assert.equal(local.fail, undefined);
    assert.match(local.skip, /1\.99\.1/);
    const onCi = rustToolchainVerdict({ ...toolchain, pinned, ci: true });
    assert.equal(onCi.skip, false);
    assert.match(onCi.fail ?? '', /1\.99\.1/);
  }
});
