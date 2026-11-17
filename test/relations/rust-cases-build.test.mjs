// Every Rust case of the catalogue is a crate (or a workspace) that rustc reads, so a case cannot pass for a reason no compiler agrees with. This builds each one with `cargo check --offline` under the pinned toolchain, in a throwaway directory, with stub crates in place of every registry and git dependency (test/helpers/rust-fixtures.mjs). Where that toolchain is missing or of another version the test is skipped with the reason, except on CI, where the workflow installs it and the test fails instead (rustToolchainVerdict).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

/** The cases that do not build yet: skeletons that hold the files a resolver reads and no crate root or module declaration around them, a `[patch]` or a proc-macro crate the stubs do not stand in for, a bench or a test target without its file, manifests written for the reader (a dotted key before `[package]`), macros from crates the stubs do not define (`cfg_if!`), and one file that is unparsable on purpose. Each is a fixture to complete, and the test below says when one has been, so this list only shrinks. */
const DO_NOT_BUILD_YET = new Set([
  'rust-autolib-off-own-crate-name-from-bin-silence',
  'rust-autolib-off-path-dependency-without-lib-silence',
  'rust-crate-path-root-item-of-known-macro-edge',
  'rust-crate-root-glob-module-without-name-silence',
  'rust-crate-root-two-globs-same-name-silence',
  'rust-dotted-key-workspace-dependency-edge',
  'rust-edition-2015-bench-file-exists-src-bench-module-edge',
  'rust-edition-2015-use-crate-root-item-bitflags-edge',
  'rust-edition-2015-use-crate-root-item-cfg-if-mod-edge',
  'rust-edition-2015-use-crate-root-item-edge',
  'rust-edition-2015-use-crate-root-item-static-closure-silence',
  'rust-edition-2018-bin-in-src-of-2015-package-bare-use-edge',
  'rust-edition-2018-src-bench-module-edge',
  'rust-edition-2018-use-imported-module-in-function-body-edge',
  'rust-edition-2018-use-leading-colons-crate-only-edge',
  'rust-edition-inline-workspace-bare-use-registry-crate-edge',
  'rust-extern-crate-alias-edge',
  'rust-inline-bare-root-silence',
  'rust-inline-dependency-table-edge',
  'rust-inline-mod-tests-super-glob-silence',
  'rust-inline-target-array-crate-root-edge',
  'rust-integration-test-mod-common-edge',
  'rust-lib-path-outside-src-main-module-edge',
  'rust-mod-decl-inside-cfg-if-edge',
  'rust-mod-decl-inside-cfg-if-nested-inline-and-path-edge',
  'rust-mod-decl-inside-inline-mod-edge',
  'rust-mod-path-attribute-override-edge',
  'rust-module-declared-in-cfg-if-and-stale-root-file-edge',
  'rust-module-extern-crate-alias-own-module-only-edge',
  'rust-module-in-cfg-if-of-lib-root-item-edge',
  'rust-module-of-unparsable-lib-root-item-edge',
  'rust-module-written-by-absolute-path-macro-of-lib-root-item-edge',
  'rust-module-written-by-attribute-macro-of-lib-root-item-edge',
  'rust-module-written-by-macro-2-of-lib-root-item-edge',
  'rust-multiline-string-path-dependency-edge',
  'rust-patch-crates-io-git-dependency-silence',
  'rust-patch-git-source-edge',
  'rust-patch-renamed-package-relative-path-edge',
  'rust-patch-without-path-silence',
  'rust-proc-macro-derive-helper-attribute-silence',
  'rust-reexported-extern-crate-edge',
  'rust-root-dotted-dependency-key-edge',
  'rust-several-bins-one-dir-silence',
  'rust-target-path-crate-root-edge',
  'rust-use-external-crate-silence',
  'rust-use-grouped-nested-subpath-edge',
]);

// One folder holds everything the builds write: the cases, the build output and a cargo home of its own, so the developer's cargo folder is never touched; it is removed when the tests end.
const work = skip === false && verdict.fail === undefined ? mkdtempSync(path.join(tmpdir(), 'runes-rust-cases-')) : undefined;
after(() => {
  if (work !== undefined) rmSync(work, { recursive: true, force: true });
});

function build(id) {
  const doc = loadCaseDoc(id, listCases().find((c) => c.id === id).mdPath);
  const root = mkdtempSync(path.join(work, 'case-'));
  try {
    const manifest = writeRustFixture(root, [...doc.files, ...doc.configFiles]);
    const run = spawnSync('cargo', ['check', '--offline', '--all-targets', '--workspace', '--manifest-path', path.join(root, manifest)], { cwd: root, encoding: 'utf8', env: { ...process.env, CARGO_TARGET_DIR: path.join(work, 'target'), CARGO_HOME: path.join(work, 'cargo-home') } });
    return { ok: run.status === 0, output: `${run.stderr}${run.stdout}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const rustCases = listCases().filter((c) => c.language === 'rust').map((c) => c.id);

test('every Rust case of the catalogue builds under the pinned toolchain, except the ones listed as not building yet', { skip, timeout: 900000 }, () => {
  if (verdict.fail !== undefined) assert.fail(verdict.fail);
  const broken = rustCases.filter((id) => !DO_NOT_BUILD_YET.has(id)).map((id) => ({ id, ...build(id) })).filter((r) => !r.ok);
  assert.deepEqual(broken.map((b) => `${b.id}: ${b.output.split('\n').filter((l) => /^error/.test(l)).slice(0, 2).join(' | ')}`), []);
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
