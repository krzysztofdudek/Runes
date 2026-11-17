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

// The reasons a case keeps a file out of the build. Most are what the case is about: a file Cargo builds no crate from, a decoy no path may bind, a module a `cfg` removes. The probes that no `mod` declares are fixtures to complete: rustc does not check the edge the case expects from them.
const NAMES_NOTHING = 'it holds a path that names nothing its crate has, which the case expects to give no edge; no `mod` declares it, so rustc never compiles it';
const NOT_A_TARGET = 'Cargo builds no crate from it under this manifest, which is what the case checks';
const MODULE_OF_NO_TARGET = 'a module of a file Cargo builds no crate from, which is what the case checks';
const DECOY = 'a decoy no `mod` declares: the case checks that no path binds it';
// A file whose `mod` stands in a branch under `cfg(unix)` or `cfg(windows)`, or in the `else` of one, is read on some platforms and not on others, so the check takes it as read or not, whichever the platform it runs on decides.
const PLATFORM_CFG = 'its `mod` stands in a branch that `cfg(unix)` or `cfg(windows)` decides, so rustc reads it on some platforms only; the case reads every branch';
const PATCH_NOT_APPLIED = 'the crate a `[patch]` names but does not apply here, so no build compiles it, which is what the case checks';
const REFUSED_PATH = 'it holds a path rustc refuses, as the case says, so no `mod` declares it and rustc never compiles it';
const PROBE_NOT_COMPILED = 'no `mod` declares it, so rustc never compiles the probe it holds: a fixture to complete';

/** The files a case keeps out of the build, by case, each with the reason: rustc reads every other `.rs` file of a case that builds. The test below fails when rustc reads a file listed here, so this list only shrinks. */
const KEPT_OUT_OF_THE_BUILD = new Map([
  ['rust-autobins-off-undeclared-main-silence', new Map([['src/main.rs', NOT_A_TARGET], ['src/tools/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-autolib-off-lib-file-module-edge', new Map([['src/lib.rs', NOT_A_TARGET], ['src/tools/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-autolib-off-own-crate-name-from-bin-silence', new Map([['src/lib.rs', NOT_A_TARGET], ['src/util/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-autolib-off-path-dependency-without-lib-silence', new Map([['core-lib/src/lib.rs', NOT_A_TARGET], ['core-lib/src/main.rs', 'the binary of a path dependency, which a build of the package does not compile; the case reads only that the dependency has no library'], ['core-lib/src/util/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-autotests-off-test-module-edge', new Map([['tests/cases.rs', DECOY]])],
  ['rust-bin-declared-name-drops-inferred-bin-edge', new Map([['src/bin/cli.rs', NOT_A_TARGET], ['src/bin/util/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-bin-declared-package-name-drops-inferred-main-edge', new Map([['src/main.rs', NOT_A_TARGET], ['src/tools/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-bin-edition-2015-in-2018-package-edge', new Map([['src/api/client.rs', PROBE_NOT_COMPILED]])],
  ['rust-bin-edition-2018-in-2015-package-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-bin-path-crate-root-edge', new Map([['crates/core/search.rs', PROBE_NOT_COMPILED], ['src/flags.rs', DECOY]])],
  ['rust-bin-shared-module-two-bins-edge', new Map([['src/bin/loose/mod.rs', 'declared by no binary, which is what the case checks: a module no crate compiles gives no edge']])],
  ['rust-bin-target-crate-root-edge', new Map([['src/opts.rs', DECOY]])],
  ['rust-build-false-build-rs-silence', new Map([['build.rs', 'with `build = false` it is no build script, and no crate compiles it, which is what the case checks'], ['gen.rs', 'a module of a file no crate compiles, which is what the case checks']])],
  ['rust-crate-head-cfg-attr-cfg-with-comment-root-item-edge', new Map([['src/decoy.rs', 'the `cfg(any())` at the head of the library removes its `mod decoy;`, which is what the case checks']])],
  ['rust-crate-path-root-item-of-known-macro-edge', new Map([['src/api/mod.rs', PROBE_NOT_COMPILED]])],
  ['rust-crate-path-root-name-in-comment-silence', new Map([['src/api/mod.rs', PROBE_NOT_COMPILED]])],
  ['rust-crate-path-root-name-in-string-or-nested-fn-silence', new Map([['src/api/mod.rs', PROBE_NOT_COMPILED]])],
  ['rust-crate-root-glob-module-without-name-silence', new Map([['app/src/orders.rs', REFUSED_PATH]])],
  ['rust-crate-root-globs-under-opposite-cfgs-edge', new Map([['kit/src/unix.rs', PLATFORM_CFG], ['kit/src/windows.rs', PLATFORM_CFG]])],
  ['rust-crate-root-two-globs-same-name-silence', new Map([['app/src/orders.rs', REFUSED_PATH]])],
  ['rust-edition-2015-autobins-true-shared-name-inferred-bins-edge', new Map([['src/bin/cli.rs', NOT_A_TARGET], ['src/bin/cli/inner.rs', MODULE_OF_NO_TARGET], ['src/bin/cli/main.rs', NOT_A_TARGET], ['src/bin/util/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-edition-2015-autolib-off-legacy-bin-path-edge', new Map([['src/lib.rs', NOT_A_TARGET], ['src/other.rs', MODULE_OF_NO_TARGET]])],
  ['rust-edition-2015-bench-file-exists-src-bench-module-edge', new Map([['src/helpers/mod.rs', DECOY]])],
  ['rust-edition-2015-declared-bench-undiscovered-silence', new Map([['benches/inputs/mod.rs', MODULE_OF_NO_TARGET], ['benches/parse.rs', NOT_A_TARGET]])],
  ['rust-edition-2015-declared-bin-main-silence', new Map([['src/main.rs', NOT_A_TARGET], ['src/tools/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-edition-2015-declared-example-undiscovered-silence', new Map([['examples/demo.rs', NOT_A_TARGET], ['examples/support/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-edition-2015-declared-test-common-module-edge', new Map([['tests/other.rs', NOT_A_TARGET]])],
  ['rust-edition-2015-declared-test-undiscovered-silence', new Map([['tests/helpers/mod.rs', MODULE_OF_NO_TARGET], ['tests/smoke.rs', NOT_A_TARGET]])],
  ['rust-edition-2015-empty-bin-array-main-silence', new Map([['src/main.rs', NOT_A_TARGET], ['src/tools/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-edition-2015-extern-crate-elsewhere-root-module-edge', new Map([['src/api/mod.rs', PROBE_NOT_COMPILED], ['src/jobs/mod.rs', PROBE_NOT_COMPILED], ['src/tools/mod.rs', PROBE_NOT_COMPILED]])],
  ['rust-edition-2015-legacy-bin-path-shared-name-edge', new Map([['src/bin/cli.rs', NOT_A_TARGET], ['src/bin/cli/main.rs', NOT_A_TARGET]])],
  ['rust-edition-2015-legacy-lib-path-edge', new Map([['src/cli.rs', NOT_A_TARGET]])],
  ['rust-edition-2015-path-dependency-without-extern-crate-silence', new Map([['src/api/a.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-root-extern-crate-path-dependency-edge', new Map([['src/api/a.rs', PROBE_NOT_COMPILED], ['src/tools/mod.rs', PROBE_NOT_COMPILED]])],
  ['rust-edition-2015-use-crate-root-item-bitflags-edge', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-item-cfg-if-mod-edge', new Map([['src/api/client.rs', 'no `mod` declares it, so rustc never compiles the probe it holds, whose `use imp::Backend;` names a module that a feature the build does not enable removes'], ['src/imp/mod.rs', 'its `mod` stands in a branch under `feature = "impl"`, a feature the build does not enable; the case reads every branch']])],
  ['rust-edition-2015-use-crate-root-item-const-block-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-item-edge', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-item-extern-block-edge', new Map([['src/api/client.rs', PROBE_NOT_COMPILED]])],
  ['rust-edition-2015-use-crate-root-item-inline-mod-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-item-macro-rules-body-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-item-static-block-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-item-static-closure-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-item-string-brace-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-item-thread-local-edge', new Map([['src/api/client.rs', PROBE_NOT_COMPILED]])],
  ['rust-edition-2015-use-crate-root-item-use-in-const-block-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2015-use-crate-root-relative-edge', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-edition-2018-src-bench-module-edge', new Map([['src/helpers/mod.rs', DECOY]])],
  ['rust-edition-2018-use-external-crate-silence', new Map([['src/api/client.rs', NAMES_NOTHING]])],
  ['rust-file-module-children-under-own-directory-edge', new Map([['src/platform/epoll/mod.rs', DECOY]])],
  ['rust-function-named-like-undeclared-sibling-file-edge', new Map([['src/util/parse.rs', DECOY]])],
  ['rust-inline-module-over-stale-sibling-file-edge', new Map([['src/util/codec.rs', DECOY]])],
  ['rust-inline-package-table-crate-name-edge', new Map([['crates/app/src/cmd/run.rs', 'the package `app` has no crate root, no `src/lib.rs` or `src/main.rs`, and no `mod` declares this file, so rustc never compiles the probe it holds, nor would the build reach it, which compiles `crates/kit` alone in a case with no root manifest: a fixture to complete'], ['crates/kit/src/lib.rs', DECOY], ['crates/util/src/lib.rs', 'in a package the build does not compile: the case has no root manifest, and the test builds the first manifest it writes, `crates/kit`, alone'], ['crates/util/tests/it.rs', 'in a package the build does not compile: the case has no root manifest, and the test builds the first manifest it writes, `crates/kit`, alone']])],
  ['rust-lib-path-below-bin-dir-edge', new Map([['app/lib/jobs/run.rs', PROBE_NOT_COMPILED], ['app/util.rs', DECOY]])],
  ['rust-lib-path-outside-src-main-module-edge', new Map([['src/cli/run.rs', NAMES_NOTHING]])],
  ['rust-macro-export-silence', new Map([['src/app/mod.rs', PROBE_NOT_COMPILED], ['src/macros/mod.rs', PROBE_NOT_COMPILED]])],
  ['rust-mod-decl-inside-cfg-if-edge', new Map([['src/other/mod.rs', PLATFORM_CFG], ['src/unix/mod.rs', PLATFORM_CFG]])],
  ['rust-mod-decl-inside-cfg-if-nested-inline-and-path-edge', new Map([['src/deep/leaf.rs', PLATFORM_CFG], ['src/imp/net.rs', PLATFORM_CFG], ['src/inner.rs', DECOY], ['src/net/mod.rs', DECOY], ['src/other/mod.rs', PLATFORM_CFG], ['src/sys/inner.rs', PLATFORM_CFG], ['src/windows/mod.rs', PLATFORM_CFG]])],
  ['rust-mod-decl-inside-inline-mod-edge', new Map([['src/app/inner/mod.rs', DECOY]])],
  ['rust-mod-path-attribute-before-doc-comment-silence', new Map([['src/net/mod.rs', DECOY], ['src/sys/mod.rs', DECOY]])],
  ['rust-mod-path-attribute-relative-to-declaring-file-edge', new Map([['src/ui/f/dd.rs', DECOY], ['src/ui/via_attr.rs', DECOY]])],
  ['rust-module-declared-in-cfg-if-and-stale-root-file-edge', new Map([['src/legacy.rs', DECOY], ['src/unix/mod.rs', PLATFORM_CFG]])],
  ['rust-module-in-cfg-if-of-lib-root-item-edge', new Map([['src/other/mod.rs', PLATFORM_CFG], ['src/unix/mod.rs', PLATFORM_CFG]])],
  ['rust-module-no-root-declares-root-item-edge', new Map([['src/orphan/mod.rs', 'declared by no root, which is what the case checks: nothing is concluded from that']])],
  ['rust-multiline-string-path-dependency-edge', new Map([['crates/app/src/cmd/run.rs', PROBE_NOT_COMPILED]])],
  ['rust-patch-crates-io-git-dependency-silence', new Map([['vendor/kit/src/lib.rs', PATCH_NOT_APPLIED]])],
  ['rust-patch-member-manifest-ignored-silence', new Map([['vendor/kit/src/lib.rs', PATCH_NOT_APPLIED]])],
  ['rust-patch-own-path-dependency-kept-edge', new Map([['vendor/kit/src/lib.rs', PATCH_NOT_APPLIED]])],
  ['rust-patch-renamed-package-relative-path-edge', new Map([['crates/app/vendor/kit/src/lib.rs', DECOY]])],
  ['rust-patch-without-path-silence', new Map([['vendor/kit/src/lib.rs', PATCH_NOT_APPLIED]])],
  ['rust-path-attribute-in-inline-module-loaded-file-owns-directory-edge', new Map([['src/outer/loaded/child.rs', DECOY]])],
  ['rust-path-attribute-in-inline-module-of-bin-root-edge', new Map([['src/bin/outer/loaded/child.rs', DECOY]])],
  ['rust-path-attribute-in-inline-module-of-library-path-root-edge', new Map([['engine/root/outer/child.rs', DECOY]])],
  ['rust-path-attribute-in-inline-module-of-module-file-named-lib-edge', new Map([['src/a/outer/child.rs', 'loaded by nothing, which is what the case checks: its `mod child;` gives no edge to the decoy beside it'], ['src/a/outer/loaded.rs', 'loaded by nothing, which is what the case checks: its `mod child;` gives no edge to the decoy beside it']])],
  ['rust-path-attribute-in-inline-module-of-path-loaded-file-edge', new Map([['src/plat/linux/inner/leaf.rs', DECOY]])],
  ['rust-path-attribute-in-inline-module-of-plain-module-file-edge', new Map([['src/outer/child.rs', DECOY]])],
  ['rust-path-loaded-file-children-beside-it-edge', new Map([['src/platform/linux/epoll.rs', DECOY]])],
  ['rust-path-loaded-file-relative-path-forms-edge', new Map([['src/wrap/stray.rs', 'it only makes the directory `src/wrap/` exist, which the `#[path]` written in the inline module `wrap` goes through']])],
  ['rust-proc-macro-derive-helper-attribute-silence', new Map([['app/src/builders.rs', REFUSED_PATH]])],
  ['rust-raw-identifier-module-edge', new Map([['src/app/mod.rs', PROBE_NOT_COMPILED]])],
  ['rust-reexported-extern-crate-edge', new Map([['crates/app/src/cmd/search.rs', PROBE_NOT_COMPILED]])],
  ['rust-several-bins-one-dir-silence', new Map([['tools/cmd/run.rs', REFUSED_PATH]])],
  ['rust-target-path-crate-root-edge', new Map([['tests/support.rs', DECOY]])],
  ['rust-target-paths-shared-dir-silence', new Map([['suites/shared/mod.rs', 'declared by no root, which is what the case checks: a module that two roots could declare binds neither'], ['tests/common/mod.rs', 'declared by no root, which is what the case checks: a module that two roots could declare binds neither']])],
  ['rust-test-declared-name-drops-inferred-test-edge', new Map([['tests/api.rs', NOT_A_TARGET], ['tests/support/mod.rs', MODULE_OF_NO_TARGET]])],
  ['rust-top-level-use-list-edge', new Map([['crates/app/src/cmd/run.rs', PROBE_NOT_COMPILED]])],
  ['rust-use-crate-root-item-edge', new Map([['src/orders/mod.rs', NAMES_NOTHING]])],
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
  assert.deepEqual(built.flatMap((r) => [...kept(r.id)].filter(([f, why]) => why !== PLATFORM_CFG && !r.unread.includes(f)).map(([f]) => `${r.id}: ${f}`)), [], 'rustc reads these files now: take them out of KEPT_OUT_OF_THE_BUILD');
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
