// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/rust-resolve.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect, beforeEach, afterEach } from '../../helpers/expect.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { makeResolvePathToFile } from '@chrisdudek/runes/relations';
import { parseCargoManifest, rustFileDeclares } from '../../helpers/internal/relations.mjs';
import { resolveRustPath } from '../../helpers/internal/relations.mjs';

// The Rust resolver maps a `::`-path → a `.rs` file through the crate module tree.
// The crate root is the nearest ancestor of the importing file containing a
// Cargo.toml; its `src/` is the module-tree root. These tests build a real temp
// crate and clean it up in `afterEach`, driven through the production
// makeResolvePathToFile (disk-backed Cargo.toml + existence).

describe('resolveRustPath via makeResolvePathToFile (disk-backed)', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'rust-resolve-'));
    // A crate named `mycrate` with src/ as the module-tree root.
    writeFileSync(
      path.join(root, 'Cargo.toml'),
      '[package]\nname = "mycrate"\nversion = "0.1.0"\nedition = "2021"\n',
      'utf-8',
    );
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    // crate::a::b → src/a/b.rs
    writeFileSync(path.join(root, 'src', 'a', 'b.rs'), '// b\n', 'utf-8');
    // crate::a (module via file) → src/a.rs
    writeFileSync(path.join(root, 'src', 'a.rs'), 'pub mod b;\n', 'utf-8');
    // crate::orders → src/orders/mod.rs (mod.rs form)
    mkdirSync(path.join(root, 'src', 'orders'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'orders', 'mod.rs'), '// orders\n', 'utf-8');
    // crate root entry
    writeFileSync(path.join(root, 'src', 'lib.rs'), 'pub mod a;\npub mod orders;\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves crate::a::b to src/a/b.rs (item path → file)', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('crate::a::b', 'src/lib.rs', 'rust')).toBe('src/a/b.rs');
  });

  it('resolves crate::a::b::Sym to src/a/b.rs via the longest-match item fallback', () => {
    // Sym is a TYPE inside module a::b — the module file is src/a/b.rs.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('crate::a::b::Sym', 'src/lib.rs', 'rust')).toBe('src/a/b.rs');
  });

  it('resolves crate::a::Type to src/a.rs (last segment is an item in module a)', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('crate::a::Type', 'src/lib.rs', 'rust')).toBe('src/a.rs');
  });

  it('resolves crate::orders to src/orders/mod.rs (mod.rs form)', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('crate::orders::Order', 'src/lib.rs', 'rust')).toBe('src/orders/mod.rs');
  });

  it('treats the crate own name like `crate` (2018+ path clarity)', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('mycrate::a::b', 'src/lib.rs', 'rust')).toBe('src/a/b.rs');
  });

  it('resolves super:: relative to the importing file module', () => {
    // From src/a/b.rs (module crate::a::b), `super::` is module crate::a → src/a.rs.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('super::Type', 'src/a/b.rs', 'rust')).toBe('src/a.rs');
  });

  it('resolves self:: against the importing file own module', () => {
    // From src/a.rs (module crate::a), `self::b` is crate::a::b → src/a/b.rs.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('self::b', 'src/a.rs', 'rust')).toBe('src/a/b.rs');
  });

  it('returns undefined for a stdlib import (external crate root)', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('std::collections::HashMap', 'src/lib.rs', 'rust')).toBeUndefined();
  });

  it('returns undefined for a third-party crate (serde) — not the crate own name', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('serde::Serialize', 'src/lib.rs', 'rust')).toBeUndefined();
  });

  it('returns undefined for a crate path whose module file is absent', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('crate::nope::Thing', 'src/lib.rs', 'rust')).toBeUndefined();
  });

  it('returns undefined when there is no Cargo.toml ancestor', () => {
    const noCrate = mkdtempSync(path.join(tmpdir(), 'rust-nocrate-'));
    try {
      mkdirSync(path.join(noCrate, 'src'), { recursive: true });
      writeFileSync(path.join(noCrate, 'src', 'a.rs'), '// a\n', 'utf-8');
      const resolve = makeResolvePathToFile(noCrate);
      expect(resolve('crate::a', 'src/lib.rs', 'rust')).toBeUndefined();
    } finally {
      rmSync(noCrate, { recursive: true, force: true });
    }
  });

  it('returns undefined when super:: climbs above the crate root', () => {
    const resolve = makeResolvePathToFile(root);
    // From src/lib.rs (crate root module), super:: climbs above src → silence.
    expect(resolve('super::super::Thing', 'src/lib.rs', 'rust')).toBeUndefined();
  });

  it('returns undefined for an empty specifier', () => {
    // No path segments at all → nothing to resolve.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('', 'src/lib.rs', 'rust')).toBeUndefined();
  });

  it('resolves a bare module path (no trailing item) via its mod.rs file', () => {
    // `crate::orders` with no further segments → the module dir`s own file src/orders/mod.rs.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('crate::orders', 'src/lib.rs', 'rust')).toBe('src/orders/mod.rs');
  });

  it('resolves a bare module path via its <dir>.rs file when there is no mod.rs', () => {
    // `crate::a` with no further segments → src/a.rs (the file form of the empty tail).
    const resolve = makeResolvePathToFile(root);
    expect(resolve('crate::a', 'src/lib.rs', 'rust')).toBe('src/a.rs');
  });

  it('resolves a bare `self` to the importing file own module file', () => {
    // `self` with an empty tail from src/a.rs (module crate::a) → the module`s own file src/a.rs.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('self', 'src/a.rs', 'rust')).toBe('src/a.rs');
  });

  it('resolves a bare `self` from a mod.rs file to that mod.rs', () => {
    // From src/orders/mod.rs (module crate::orders), bare `self` → src/orders/mod.rs.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('self', 'src/orders/mod.rs', 'rust')).toBe('src/orders/mod.rs');
  });

  it('resolves a bare `crate` to the crate root file (the crate root module`s own file)', () => {
    // `crate` alone names the crate root module, whose file is src/lib.rs (there is no
    // src/mod.rs or src.rs), so the empty tail binds the crate root file.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('crate', 'src/orders/mod.rs', 'rust')).toBe('src/lib.rs');
  });

  it('returns undefined for a super:: path when there is no Cargo.toml ancestor', () => {
    // `super::`/`self::` resolution still needs a crate root to anchor `src/`; with no
    // Cargo.toml ancestor the relative resolver yields silence.
    const noCrate = mkdtempSync(path.join(tmpdir(), 'rust-nocrate-rel-'));
    try {
      mkdirSync(path.join(noCrate, 'src'), { recursive: true });
      writeFileSync(path.join(noCrate, 'src', 'a.rs'), '// a\n', 'utf-8');
      const resolve = makeResolvePathToFile(noCrate);
      expect(resolve('super::Type', 'src/a.rs', 'rust')).toBeUndefined();
      expect(resolve('self::x', 'src/a.rs', 'rust')).toBeUndefined();
    } finally {
      rmSync(noCrate, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cargo targets, crate-root items and in-repo path dependencies (disk-backed).
describe('resolveRustPath — Cargo targets, crate-root items, path dependencies', () => {
  let ws;
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
    writeFileSync(path.join(ws, rel), text, 'utf-8');
  };

  beforeEach(() => {
    ws = mkdtempSync(path.join(tmpdir(), 'rust-targets-'));
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it('binds a crate-root item to src/lib.rs only when the root file declares or uses the name', () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('src/lib.rs', '// pub struct Commented;\npub enum Error {}\npub use self::inner::Result;\n#[macro_export]\nmacro_rules! local_mac { () => {} }\n');
    put('src/orders/mod.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::Error', 'src/orders/mod.rs', 'rust')).toBe('src/lib.rs');
    expect(resolve('crate::Error::Variant', 'src/orders/mod.rs', 'rust')).toBe('src/lib.rs');
    expect(resolve('crate::Result', 'src/orders/mod.rs', 'rust')).toBe('src/lib.rs');
    expect(resolve('crate::local_mac', 'src/orders/mod.rs', 'rust')).toBe('src/lib.rs');
    expect(resolve('crate::exported_elsewhere', 'src/orders/mod.rs', 'rust')).toBeUndefined();
    expect(resolve('crate::Commented', 'src/orders/mod.rs', 'rust')).toBeUndefined();
    // `super::X` from a top-level module climbs to the crate root module too.
    put('src/billing.rs', '');
    expect(resolve('super::Error', 'src/billing.rs', 'rust')).toBe('src/lib.rs');
  });

  it('falls back to src/main.rs when the package has no library', () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('src/main.rs', 'pub struct Config;\nfn main() {}\n');
    put('src/cli/mod.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::Config', 'src/cli/mod.rs', 'rust')).toBe('src/main.rs');
  });

  it('treats only real target roots as mod-rs-like: src/c/lib.rs is module c::lib', () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('src/c/lib/x.rs', '');
    put('src/c/x.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('self::x', 'src/c/lib.rs', 'rust')).toBe('src/c/lib/x.rs');
  });

  it('roots crate:: of src/bin/<name>.rs and src/bin/<name>/main.rs at the binary, and the package name at the lib', () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('src/lib.rs', '');
    put('src/opts.rs', '');
    put('src/bin/opts.rs', '');
    put('src/bin/multi/opts.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::opts::Args', 'src/bin/tool.rs', 'rust')).toBe('src/bin/opts.rs');
    expect(resolve('self::opts', 'src/bin/tool.rs', 'rust')).toBe('src/bin/opts.rs');
    expect(resolve('crate::opts::Args', 'src/bin/multi/main.rs', 'rust')).toBe('src/bin/multi/opts.rs');
    expect(resolve('app::opts::Args', 'src/bin/tool.rs', 'rust')).toBe('src/opts.rs');
    // A binary root has no parent module.
    expect(resolve('super::opts', 'src/bin/tool.rs', 'rust')).toBeUndefined();
  });

  it('with bin discovery turned off, roots src/bin/ files at the declared bins alone, and every other file in the tree of src/main.rs (autobins = false)', () => {
    put('Cargo.toml', '[package]\nname = "app"\nautobins = false\n[[bin]]\nname = "tool"\npath = "src/bin/tool/app.rs"\n[[bin]]\nname = "multi"\n');
    put('src/main.rs', 'mod util;\npub struct Main;\n');
    put('src/util.rs', '');
    put('src/bin/tool/app.rs', 'mod opts;\npub struct Tool;\n');
    put('src/bin/tool/opts.rs', '');
    put('src/bin/other.rs', 'mod util;\n');
    put('src/bin/multi/main.rs', 'mod ui;\npub struct Multi;\n');
    put('src/bin/multi/ui.rs', '');
    const resolve = makeResolvePathToFile(ws);
    // A declared bin, by its path and by its name alone, is a crate root of its own.
    expect(resolve('crate::opts::Args', 'src/bin/tool/app.rs', 'rust')).toBe('src/bin/tool/opts.rs');
    expect(resolve('crate::Multi', 'src/bin/multi/ui.rs', 'rust')).toBe('src/bin/multi/main.rs');
    // An undeclared file is no bin: its crate is the one of src/main.rs.
    expect(resolve('crate::util::Thing', 'src/bin/other.rs', 'rust')).toBe('src/util.rs');
    expect(resolve('crate::Main', 'src/bin/other.rs', 'rust')).toBe('src/main.rs');
    // With discovery on (the default) the same file roots its own crate.
    put('Cargo.toml', '[package]\nname = "app"\n[[bin]]\nname = "tool"\npath = "src/bin/tool/app.rs"\n');
    expect(makeResolvePathToFile(ws)('crate::Main', 'src/bin/other.rs', 'rust')).toBeUndefined();
  });

  it('reads a use path as relative to the crate root in edition 2015, which is also the default, and as an external crate from 2018 on', () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('src/lib.rs', 'mod shapes;\nextern crate serde;\nmod std;\n');
    put('src/shapes.rs', '');
    put('src/std.rs', '');
    put('src/undeclared.rs', '');
    put('src/api/client.rs', '');
    put('src/bin/tool.rs', 'mod local;\n');
    put('src/bin/local.rs', '');
    put('src/bin/shapes.rs', '');
    const edition = (value) => `[package]\nname = "app"\n${value}`;
    const resolve = () => makeResolvePathToFile(ws);
    // No edition: 2015. The root declares `shapes`, so the path binds its file from any module; a crate root is its own root.
    expect(resolve()('shapes::Circle', 'src/api/client.rs', 'rust')).toBe('src/shapes.rs');
    expect(resolve()('local::Thing', 'src/bin/tool.rs', 'rust')).toBe('src/bin/local.rs');
    // The reserved crates, a name the root does not declare and a name the root only binds with `extern crate` are external.
    expect(resolve()('std::fmt::Debug', 'src/api/client.rs', 'rust')).toBeUndefined();
    expect(resolve()('undeclared::Thing', 'src/api/client.rs', 'rust')).toBeUndefined();
    expect(resolve()('serde::Deserialize', 'src/api/client.rs', 'rust')).toBeUndefined();
    // Written 2015 reads alike; 2018 and later do not.
    put('Cargo.toml', edition('edition = "2015"\n'));
    expect(resolve()('shapes::Circle', 'src/api/client.rs', 'rust')).toBe('src/shapes.rs');
    for (const year of ['2018', '2021', '2024']) {
      put('Cargo.toml', edition(`edition = "${year}"\n`));
      expect(resolve()('shapes::Circle', 'src/api/client.rs', 'rust')).toBeUndefined();
    }
    // A manifest with no [package] is no crate; a target with no root file (tests/common/) has nothing to probe.
    put('Cargo.toml', '[workspace]\n');
    expect(resolve()('shapes::Circle', 'src/api/client.rs', 'rust')).toBeUndefined();
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('tests/common/mod.rs', '');
    expect(resolve()('shapes::Circle', 'tests/common/mod.rs', 'rust')).toBeUndefined();
  });

  it('takes the edition from the workspace for `edition.workspace = true`, and treats a workspace that gives none as unknown', () => {
    put('Cargo.toml', '[workspace]\nmembers = ["crates/a"]\n[workspace.package]\nedition = "2015"\n');
    put('crates/a/Cargo.toml', '[package]\nname = "a"\nedition.workspace = true\n');
    put('crates/a/src/lib.rs', 'mod shapes;\n');
    put('crates/a/src/shapes.rs', '');
    put('crates/a/src/api/client.rs', '');
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'crates/a/src/api/client.rs', 'rust')).toBe('crates/a/src/shapes.rs');
    put('Cargo.toml', '[workspace]\nmembers = ["crates/a"]\n[workspace.package]\nedition = "2021"\n');
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'crates/a/src/api/client.rs', 'rust')).toBeUndefined();
    put('Cargo.toml', '[workspace]\nmembers = ["crates/a"]\n');
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'crates/a/src/api/client.rs', 'rust')).toBeUndefined();
    // A package at the repository root, with no ancestor to look in.
    put('Cargo.toml', '[package]\nname = "a"\nedition.workspace = true\n');
    put('src/lib.rs', 'mod shapes;\n');
    put('src/shapes.rs', '');
    put('src/api/client.rs', '');
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'src/api/client.rs', 'rust')).toBeUndefined();
  });

  it('roots crate:: of a [[bin]] path outside src/ at that binary, for the root and the files below its directory (the ripgrep shape)', () => {
    put('Cargo.toml', '[package]\nname = "ripgrep"\n\n[[bin]]\nbench = false\npath = "crates/core/main.rs"\nname = "rg"\n\n[[bin]]\nname = "gen"\npath = "./crates/core/gen/main.rs"\n\n[[test]]\nname = "integration"\npath = "tests/tests.rs"\n');
    put('crates/core/main.rs', 'mod flags;\nmod haystack;\npub struct Thing;\n');
    put('crates/core/flags/mod.rs', 'pub struct HiArgs;\n');
    put('crates/core/haystack.rs', '');
    put('crates/core/gen/flags.rs', '');
    put('src/flags.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::flags::HiArgs', 'crates/core/main.rs', 'rust')).toBe('crates/core/flags/mod.rs');
    expect(resolve('self::flags', 'crates/core/main.rs', 'rust')).toBe('crates/core/flags/mod.rs');
    expect(resolve('crate::haystack::Haystack', 'crates/core/flags/hiargs.rs', 'rust')).toBe('crates/core/haystack.rs');
    expect(resolve('super::haystack', 'crates/core/flags/mod.rs', 'rust')).toBe('crates/core/haystack.rs');
    expect(resolve('crate::Thing', 'crates/core/flags/mod.rs', 'rust')).toBe('crates/core/main.rs');
    // The deepest [[bin]] directory holds a file, and `./` in a path is read as written.
    expect(resolve('crate::flags', 'crates/core/gen/main.rs', 'rust')).toBe('crates/core/gen/flags.rs');
    expect(resolve('crate::flags', 'crates/core/gen/util.rs', 'rust')).toBe('crates/core/gen/flags.rs');
    // A binary root has no parent module, and a file under src/ keeps the src/ tree.
    expect(resolve('super::flags', 'crates/core/main.rs', 'rust')).toBeUndefined();
    expect(resolve('crate::flags', 'src/other.rs', 'rust')).toBe('src/flags.rs');
  });

  it('keeps the library tree for src/ files when a [[bin]] path names src/main.rs, and roots a [[bin]] at the package directory', () => {
    put('Cargo.toml', '[package]\nname = "app"\n\n[[bin]]\nname = "app"\npath = "src/main.rs"\n\n[[bin]]\nname = "tool"\npath = "tool.rs"\n');
    put('src/lib.rs', 'pub enum Error {}\n');
    put('src/orders/mod.rs', '');
    put('cli/args.rs', '');
    put('tests/common.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::Error', 'src/orders/mod.rs', 'rust')).toBe('src/lib.rs');
    expect(resolve('crate::cli::args::Parser', 'tool.rs', 'rust')).toBe('cli/args.rs');
    expect(resolve('crate::cli::args', 'cli/other.rs', 'rust')).toBe('cli/args.rs');
    // The auto-discovered targets outside src/ keep their own roots.
    expect(resolve('self::common', 'tests/it.rs', 'rust')).toBe('tests/common.rs');
  });

  it('lets a [lib] path outside src/ compete with [[bin]] paths: the deepest directory wins, and the library is probed first in its own', () => {
    // Three packages side by side. Beside a binary at the package root: the library's root is probed before the binary's, as src/lib.rs before src/main.rs.
    put('root/Cargo.toml', '[package]\nname = "app"\n[lib]\npath = "lib.rs"\n[[bin]]\nname = "app"\npath = "main.rs"\n');
    put('root/lib.rs', 'pub mod foo;\npub struct Config;\npub struct LibOnly;\n');
    put('root/main.rs', 'struct Config;\nfn main() {}\n');
    put('root/foo.rs', '');
    // In the same directory as the binary, outside src/.
    put('same/Cargo.toml', '[package]\nname = "app"\n[lib]\npath = "crates/core/lib.rs"\n[[bin]]\nname = "app"\npath = "crates/core/main.rs"\n');
    put('same/crates/core/lib.rs', 'pub mod util;\npub struct Item;\n');
    put('same/crates/core/main.rs', 'struct Bin;\nfn main() {}\n');
    put('same/crates/core/other.rs', '');
    // Below the binary's directory: the library's deeper directory holds its files.
    put('below/Cargo.toml', '[package]\nname = "app"\n[lib]\npath = "lib/lib.rs"\n[[bin]]\nname = "app"\npath = "main.rs"\n');
    put('below/lib/lib.rs', 'pub mod util;\npub struct Item;\n');
    put('below/main.rs', 'mod util;\nstruct Item;\n');
    put('below/lib/util.rs', '');
    put('below/util.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::Config', 'root/foo.rs', 'rust')).toBe('root/lib.rs');
    expect(resolve('crate::LibOnly', 'root/foo.rs', 'rust')).toBe('root/lib.rs');
    expect(resolve('crate::foo', 'root/lib.rs', 'rust')).toBe('root/foo.rs');
    expect(resolve('crate::Item', 'same/crates/core/util.rs', 'rust')).toBe('same/crates/core/lib.rs');
    expect(resolve('crate::Bin', 'same/crates/core/util.rs', 'rust')).toBe('same/crates/core/main.rs');
    expect(resolve('crate::other', 'same/crates/core/util.rs', 'rust')).toBe('same/crates/core/other.rs');
    expect(resolve('crate::Item', 'below/lib/util.rs', 'rust')).toBe('below/lib/lib.rs');
    expect(resolve('crate::util', 'below/lib/lib.rs', 'rust')).toBe('below/lib/util.rs');
    expect(resolve('crate::util', 'below/lib/other.rs', 'rust')).toBe('below/lib/util.rs');
    expect(resolve('crate::util', 'below/main.rs', 'rust')).toBe('below/util.rs');
  });

  it('gives a module no binary root when two [[bin]] paths share its directory, and each binary its own', () => {
    put('Cargo.toml', '[package]\nname = "app"\n[[bin]]\nname = "a"\npath = "tools/a.rs"\n[[bin]]\nname = "b"\npath = "tools/b.rs"\n[[bin]]\nname = "cli"\npath = "cli/main.rs"\n[[bin]]\nname = "cli2"\npath = "cli/./main.rs"\n');
    put('tools/a.rs', 'pub struct Opts;\nfn main() {}\n');
    put('tools/b.rs', 'mod util;\nfn main() {}\n');
    put('tools/util.rs', '');
    put('tools/helper.rs', '');
    put('cli/main.rs', 'pub struct Opts;\nfn main() {}\n');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::Opts', 'tools/util.rs', 'rust')).toBeUndefined();
    expect(resolve('crate::helper', 'tools/util.rs', 'rust')).toBe('tools/helper.rs');
    expect(resolve('crate::Opts', 'tools/a.rs', 'rust')).toBe('tools/a.rs');
    expect(resolve('crate::Opts', 'tools/b.rs', 'rust')).toBeUndefined();
    expect(resolve('self::util', 'tools/b.rs', 'rust')).toBe('tools/util.rs');
    // One path named twice is one binary.
    expect(resolve('crate::Opts', 'cli/args.rs', 'rust')).toBe('cli/main.rs');
  });

  it('gives a src/ file the root of src/main.rs, never a [lib] path outside src/', () => {
    // Issue 173: a src/ file probed the library's root first wherever it lay, so `crate::Config` in a module of the binary bound the library's `Config`, and `crate::Item` an item only the library has.
    put('a/Cargo.toml', '[package]\nname = "app"\n[lib]\npath = "lib/lib.rs"\n');
    put('a/lib/lib.rs', 'pub mod util;\npub struct Config;\npub struct Item;\n');
    put('a/lib/util.rs', '');
    put('a/src/main.rs', 'mod cli;\nstruct Config;\nfn main() {}\n');
    put('a/src/args.rs', '');
    put('b/Cargo.toml', '[package]\nname = "app"\n[lib]\npath = "lib.rs"\n');
    put('b/lib.rs', 'pub struct Config;\n');
    put('b/src/main.rs', 'struct Config;\nfn main() {}\n');
    put('c/Cargo.toml', '[package]\nname = "app"\n[lib]\npath = "src/core.rs"\n');
    put('c/src/core.rs', 'pub struct Config;\n');
    put('c/src/main.rs', 'struct Config;\nfn main() {}\n');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::Config', 'a/src/cli.rs', 'rust')).toBe('a/src/main.rs');
    expect(resolve('crate::Item', 'a/src/cli.rs', 'rust')).toBeUndefined();
    expect(resolve('crate::args', 'a/src/cli.rs', 'rust')).toBe('a/src/args.rs');
    // A library at the package root holds src/, but src/main.rs's directory is the deeper one.
    expect(resolve('crate::Config', 'b/src/cli.rs', 'rust')).toBe('b/src/main.rs');
    // The library keeps its own tree, and the package's name still addresses it from the binary's modules.
    expect(resolve('crate::Item', 'a/lib/util.rs', 'rust')).toBe('a/lib/lib.rs');
    expect(resolve('crate::util', 'a/lib/lib.rs', 'rust')).toBe('a/lib/util.rs');
    expect(resolve('app::Config', 'a/src/cli.rs', 'rust')).toBe('a/lib/lib.rs');
    // A [lib] path inside src/ is probed first, as src/lib.rs is.
    expect(resolve('crate::Config', 'c/src/cli.rs', 'rust')).toBe('c/src/core.rs');
  });

  it('roots crate:: of a [[test]], [[example]] or [[bench]] path at that target, also below tests/ where no main.rs is (the zed shape)', () => {
    // Issue 173: those paths were ignored, so such a target's root was a module of the default tree and its modules resolved under src/ or under tests/.
    put('Cargo.toml', '[package]\nname = "app"\n[[test]]\nname = "integration"\npath = "tests/integration/suite.rs"\n[[example]]\nname = "viewer"\npath = "demos/viewer/app.rs"\n[[bench]]\nname = "perf"\npath = "perf/bench_main.rs"\n');
    put('src/lib.rs', 'pub struct Harness;\npub mod support;\n');
    put('src/support.rs', '');
    put('src/state.rs', '');
    put('tests/support.rs', '');
    put('tests/integration/suite.rs', 'mod support;\npub struct TestServer;\n');
    put('tests/integration/support/mod.rs', '');
    put('demos/viewer/app.rs', 'mod state;\n');
    put('demos/viewer/state.rs', '');
    put('perf/bench_main.rs', 'mod cases;\npub struct Harness;\n');
    put('perf/cases/mod.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('self::support', 'tests/integration/suite.rs', 'rust')).toBe('tests/integration/support/mod.rs');
    expect(resolve('crate::support::Fixture', 'tests/integration/cases/login.rs', 'rust')).toBe('tests/integration/support/mod.rs');
    expect(resolve('crate::TestServer', 'tests/integration/cases/login.rs', 'rust')).toBe('tests/integration/suite.rs');
    expect(resolve('super::TestServer', 'tests/integration/login.rs', 'rust')).toBe('tests/integration/suite.rs');
    expect(resolve('crate::state::Model', 'demos/viewer/app.rs', 'rust')).toBe('demos/viewer/state.rs');
    expect(resolve('crate::state::Model', 'demos/viewer/panels/list.rs', 'rust')).toBe('demos/viewer/state.rs');
    expect(resolve('crate::Harness', 'perf/cases/sort.rs', 'rust')).toBe('perf/bench_main.rs');
    expect(resolve('self::cases', 'perf/bench_main.rs', 'rust')).toBe('perf/cases/mod.rs');
    // A target root has no parent module.
    expect(resolve('super::support', 'tests/integration/suite.rs', 'rust')).toBeUndefined();
  });

  it('with test discovery turned off, roots the files of tests/ at the declared tests alone, and reads a target array written inline (issue 181)', () => {
    // ripgrep's shape: `autotests = false` and one `[[test]] path = "tests/tests.rs"`, so tests/util.rs and tests/common/ are modules of that one crate.
    put('Cargo.toml', 'bin = [{ name = "tool", path = "tools/tool.rs" }]\n[package]\nname = "app"\nautotests = false\nautoexamples = false\nautobenches = false\n[[test]]\nname = "integration"\npath = "tests/tests.rs"\n[[example]]\nname = "demo"\n');
    put('src/lib.rs', 'pub struct Dir;\n');
    put('tests/tests.rs', 'mod common;\nmod util;\npub struct Dir;\n');
    put('tests/common/mod.rs', '');
    put('tests/util.rs', 'mod helper;\n');
    put('tests/util/helper.rs', '');
    put('tests/helper.rs', '');
    put('examples/demo/main.rs', 'mod ui;\npub struct Model;\n');
    put('examples/demo/ui.rs', '');
    put('examples/other.rs', 'pub struct Model;\n');
    put('benches/speed.rs', 'pub struct Thing;\n');
    put('tools/tool.rs', 'mod sub;\npub struct Config;\n');
    put('tools/sub.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::Dir', 'tests/common/mod.rs', 'rust')).toBe('tests/tests.rs');
    expect(resolve('crate::Dir', 'tests/util.rs', 'rust')).toBe('tests/tests.rs');
    // tests/util.rs is a module, so its own `mod helper;` lies in tests/util/, never beside it.
    expect(resolve('self::helper', 'tests/util.rs', 'rust')).toBe('tests/util/helper.rs');
    // An [[example]] that gives only its name is rooted where Cargo infers it; a file no declared target roots has no root.
    expect(resolve('crate::Model', 'examples/demo/ui.rs', 'rust')).toBe('examples/demo/main.rs');
    expect(resolve('crate::Model', 'examples/other.rs', 'rust')).toBeUndefined();
    expect(resolve('crate::Thing', 'benches/speed.rs', 'rust')).toBeUndefined();
    // `bin = [{ path = … }]` roots its crate as `[[bin]]` does.
    expect(resolve('crate::Config', 'tools/sub.rs', 'rust')).toBe('tools/tool.rs');
    expect(resolve('self::sub', 'tools/tool.rs', 'rust')).toBe('tools/sub.rs');
  });

  it('leaves a shared helper under tests/ rootless beside a [[test]] path in tests/ itself, and gives no root to the modules of two test paths sharing a directory', () => {
    // ripgrep's `[[test]] path = "tests/tests.rs"`: with test auto-discovery other test crates in tests/ may declare tests/common/ too.
    put('Cargo.toml', '[package]\nname = "app"\n[[test]]\nname = "integration"\npath = "tests/tests.rs"\n[[test]]\nname = "a"\npath = "suites/a.rs"\n[[test]]\nname = "b"\npath = "suites/b.rs"\n[[bench]]\nname = "c"\npath = "suites/c/main.rs"\n');
    put('src/lib.rs', 'pub struct Dir;\npub struct Env;\n');
    put('tests/tests.rs', 'mod common;\npub struct Dir;\n');
    put('tests/common/mod.rs', '');
    put('tests/util.rs', '');
    put('suites/a.rs', 'pub struct Env;\n');
    put('suites/b.rs', 'mod shared;\n');
    put('suites/shared/mod.rs', '');
    put('suites/c/main.rs', 'pub struct Env;\n');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::Dir', 'tests/common/mod.rs', 'rust')).toBeUndefined();
    expect(resolve('crate::util', 'tests/common/mod.rs', 'rust')).toBe('tests/util.rs');
    expect(resolve('crate::Dir', 'tests/tests.rs', 'rust')).toBe('tests/tests.rs');
    expect(resolve('crate::Env', 'suites/shared/mod.rs', 'rust')).toBeUndefined();
    expect(resolve('crate::shared', 'suites/shared/x.rs', 'rust')).toBe('suites/shared/mod.rs');
    // A root in a deeper directory still holds the files below it.
    expect(resolve('crate::Env', 'suites/c/run.rs', 'rust')).toBe('suites/c/main.rs');
  });

  it('resolves tests/<name>.rs as a test crate root and a shared tests/common/mod.rs under tests/', () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('tests/common/mod.rs', '');
    put('tests/fixtures.rs', '');
    put('examples/demo/main.rs', '');
    put('examples/demo/ui.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('self::common', 'tests/it.rs', 'rust')).toBe('tests/common/mod.rs');
    expect(resolve('super::fixtures', 'tests/common/mod.rs', 'rust')).toBe('tests/fixtures.rs');
    // A shared helper has no single crate root to hold items → silence.
    expect(resolve('crate::Thing', 'tests/common/mod.rs', 'rust')).toBeUndefined();
    expect(resolve('crate::ui', 'examples/demo/main.rs', 'rust')).toBe('examples/demo/ui.rs');
  });

  it('resolves in-repo path dependencies: inline, table form, workspace-inherited, renamed, [lib] name', () => {
    put('Cargo.toml', '[workspace]\nmembers = ["crates/*"]\n\n[workspace.dependencies]\n"shared-kit" = { path = "crates/shared", package = "shared" }\nremote = "1"\n');
    put('crates/core-lib/Cargo.toml', '[package]\nname = "core-lib"\n');
    put('crates/core-lib/src/lib.rs', 'pub struct Engine;\n');
    put('crates/tables/Cargo.toml', '[package]\nname = "tables"\n');
    put('crates/tables/src/grid/mod.rs', '');
    put('crates/named/Cargo.toml', '[package]\nname = "named-pkg"\n\n[lib]\nname = "nm"\npath = "lib/root.rs"\n');
    put('crates/named/lib/root.rs', 'pub struct Root;\n');
    put('crates/shared/Cargo.toml', '[package]\nname = "shared"\n');
    put('crates/shared/src/kit.rs', '');
    put(
      'crates/server/Cargo.toml',
      [
        '[package]',
        'name = "server"',
        '',
        '[dependencies]',
        'core-lib = { path = "../core-lib", version = "0.1" } # a comment',
        'renamed = { path = "../core-lib", package = "core-lib" }',
        'nm = { path = "../named" }',
        'shared-kit = { workspace = true }',
        'outside = { path = "../../../elsewhere" }',
        'serde = "1"',
        '',
        '[dependencies.tables]',
        'path = "../tables"',
        '',
        "[target.'cfg(unix)'.dev-dependencies]",
        'nix-only = { path = "../missing" }',
      ].join('\n') + '\n',
    );
    const from = 'crates/server/src/main.rs';
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('core_lib::Engine', from, 'rust')).toBe('crates/core-lib/src/lib.rs');
    expect(resolve('renamed::Engine', from, 'rust')).toBe('crates/core-lib/src/lib.rs');
    expect(resolve('tables::grid::Grid', from, 'rust')).toBe('crates/tables/src/grid/mod.rs');
    // Issue 482: on a case-insensitive file system (macOS, Windows) lib/Root.rs used to be found as lib/root.rs, so nm::Root resolved to a file that is not there. The probe compares names as the directory lists them.
    expect(resolve('nm::Root', from, 'rust')).toBe('crates/named/lib/root.rs');
    expect(resolve('shared_kit::kit::K', from, 'rust')).toBe('crates/shared/src/kit.rs');
    expect(resolve('core_lib', from, 'rust')).toBe('crates/core-lib/src/lib.rs');
    // Silence: registry dep, a dep whose path leaves the repo, a path with no crate, an
    // undeclared name, and a crate-root item the dependency's root file does not declare.
    expect(resolve('serde::Serialize', from, 'rust')).toBeUndefined();
    expect(resolve('outside::X', from, 'rust')).toBeUndefined();
    expect(resolve('nix_only::X', from, 'rust')).toBeUndefined();
    expect(resolve('shared::kit::K', from, 'rust')).toBeUndefined();
    expect(resolve('core_lib::Missing', from, 'rust')).toBeUndefined();
  });
});

describe('parseCargoManifest / rustFileDeclares', () => {
  it('reads [lib].name over [package].name and normalizes hyphens', () => {
    expect(parseCargoManifest('[package]\nname = "a-b"\n').crateName).toBe('a_b');
    expect(parseCargoManifest('[package]\nname = "a-b"\n[lib]\nname = "c_d"\n').crateName).toBe('c_d');
  });

  it('reads the path of each [[bin]], [[test]], [[example]] and [[bench]] table, and no other table\'s path', () => {
    const targets = (text) => parseCargoManifest(text).targetPaths;
    expect(targets('[[bin]]\nname = "rg"\npath = "crates/core/main.rs"\n\n[[bin]]\nname = "auto"\n\n[[bin]]\npath = \'tools/gen.rs\' # generator\n')).toEqual(['crates/core/main.rs', 'tools/gen.rs']);
    // Issue 173: the paths of [[test]], [[example]] and [[bench]] tables were ignored.
    expect(targets('[lib]\npath = "lib/lib.rs"\n[[test]]\npath = "tests/it.rs"\n[[example]]\nname = "viewer"\npath = "demos/viewer/app.rs"\n[[bench]]\npath = "perf/main.rs"\n[[bin]]\nname = "x"\n')).toEqual(['tests/it.rs', 'demos/viewer/app.rs', 'perf/main.rs']);
    expect(targets('[bin.extra]\npath = "nope.rs"\n[test]\npath = "no.rs"\n[[tests]]\npath = "no.rs"\n[[bin.x]]\npath = "no.rs"\n[package]\npath = "no.rs"\n[[bin]]\npath = 5\n')).toEqual([]);
    expect(targets('[[bin]]\r\nname = "rg"\r\npath = "crates/core/main.rs"\r\n[[test]]\r\npath = "tests/integration/suite.rs"\r\n')).toEqual(['crates/core/main.rs', 'tests/integration/suite.rs']);
  });

  it('reads the target arrays written inline, the targets that give only a name, and the [package] flags that turn auto-discovery off (issue 181)', () => {
    const read = (text) => {
      const m = parseCargoManifest(text);
      return { targetPaths: m.targetPaths, undiscoveredDirs: m.undiscoveredDirs, namedTargets: m.namedTargets };
    };
    // `bin = [{ path = … }]` was not read, so such a root was a module of another tree.
    expect(read('bin = [{ name = "x", path = "tools/x.rs" }, { path = \'tools/y.rs\' }]\ntest = [\n  { name = "a", path = "t/a.rs" }, # first\n  { name = "b", required-features = ["x,]"] },\n]\nexample = [{ name = "e", path = """ex/e.rs""" }]\nbench = []\n')).toEqual({ targetPaths: ['tools/x.rs', 'tools/y.rs', 't/a.rs', 'ex/e.rs'], undiscoveredDirs: [], namedTargets: ['tests/b'] });
    // A name with no path is rooted by Cargo at <dir>/<name>.rs or <dir>/<name>/main.rs, a [[bin]] name at src/bin/<name>.rs or src/bin/<name>/main.rs; a path written but unreadable is no name-only target.
    expect(read('[[test]]\nname = "integration"\n[[example]]\nname = "demo"\n[[bench]]\nname = "speed"\npath.x = 1\n[[bin]]\nname = "cli"\ntest = 1\n')).toEqual({ targetPaths: [], undiscoveredDirs: [], namedTargets: ['tests/integration', 'examples/demo', 'src/bin/cli'] });
    // `autotests` and `autobins` were not read, so every file in tests/ and src/bin/ was a crate root.
    expect(read('[package]\nname = "p"\nautotests = false\nautoexamples = true\nautobins = false\n[package.metadata]\nautobenches = false\n').undiscoveredDirs).toEqual(['tests', 'src/bin']);
    expect(read('package = { name = "p", autobenches = false, autoexamples = false }\n').undiscoveredDirs).toEqual(['benches', 'examples']);
    expect(read('package.autotests = false\r\n[package]\r\nautotests = "false"\r\n').undiscoveredDirs).toEqual(['tests']);
  });

  it('reads the edition a package writes, inherits or leaves out, and the edition [workspace.package] gives', () => {
    const read = (text) => {
      const m = parseCargoManifest(text);
      return { hasPackage: m.hasPackage, edition: m.edition, editionInherited: m.editionInherited, workspaceEdition: m.workspaceEdition };
    };
    expect(read('[package]\nname = "p"\nedition = "2018"\n')).toEqual({ hasPackage: true, edition: '2018', editionInherited: false, workspaceEdition: undefined });
    expect(read('package = { name = "p", edition = \'2021\' }\n')).toEqual({ hasPackage: true, edition: '2021', editionInherited: false, workspaceEdition: undefined });
    expect(read('[package]\nname = "p"\nedition.workspace = true\n')).toEqual({ hasPackage: true, edition: undefined, editionInherited: true, workspaceEdition: undefined });
    expect(read('[package]\nname = "p"\n')).toEqual({ hasPackage: true, edition: undefined, editionInherited: false, workspaceEdition: undefined });
    expect(read('[workspace]\n[workspace.package]\nedition = "2024"\n')).toEqual({ hasPackage: false, edition: undefined, editionInherited: false, workspaceEdition: '2024' });
    // Another table's `edition` is no package edition.
    expect(read('[dependencies]\nedition = "2018"\n[metadata]\nedition = "2018"\n[package.metadata]\nedition = "2018"\n[package]\nname = "p"\n').edition).toBeUndefined();
  });

  it('reads a string value in each of its TOML forms, so a path written as a multi-line string is that path, not an empty one', () => {
    // Issue 173: `path = """../kit"""` read as '', which made the package its own dependency.
    const read = (text) => {
      const m = parseCargoManifest(text);
      return { crateName: m.crateName, libPath: m.libPath, targetPaths: m.targetPaths, dependencies: m.dependencies };
    };
    const plain = read('[package]\nname = "app"\n[lib]\npath = "lib/lib.rs"\n[[bin]]\npath = "tools/x.rs"\n[dependencies]\nkit = { path = "../kit", package = "kit-pkg" }\nnext.path = "../next"\n[dependencies.more]\npath = "../more"\n');
    expect(plain.dependencies.get('kit')).toEqual({ path: '../kit', package: 'kit-pkg', workspace: false });
    const multi = String.raw`[package]
name = """app"""
[lib]
path = '''
lib/lib.rs'''
[[bin]]
path = """
tools/x.rs"""
[dependencies]
kit = { path = '''../kit''', package = """
kit-pkg""" }
next.path = """../\
    next"""
[dependencies.more]
path = "..\u002fmore"
`;
    expect(read(multi)).toEqual(plain);
    expect(read(multi.replace(/\n/g, '\r\n'))).toEqual(plain);
    // Escapes, quotes beside the closing delimiter, and a literal string's backslash read as TOML defines them.
    const pathOf = (value) => parseCargoManifest(`[dependencies]\nkit = { path = ${value} }\n`).dependencies.get('kit').path;
    expect(pathOf(String.raw`"../a\"b\\c"`)).toBe('../a"b\\c');
    expect(pathOf(String.raw`"\x41\U0001F600\t\e"`)).toBe('A\u{1F600}\t\x1b');
    expect(pathOf('"""a"""""')).toBe('a""');
    expect(pathOf("'''a''''")).toBe("a'");
    expect(pathOf(String.raw`'C:\dir\n'`)).toBe(String.raw`C:\dir\n`);
    // A value that is no single TOML string names no path.
    for (const value of ['5', '"a" "b"', String.raw`"\q"`, String.raw`"\uD800"`, String.raw`"\u12"`, String.raw`"""a\ b"""`, '"""a""""""', "'unclosed", String.raw`"a\"`]) {
      expect(pathOf(value), value).toBeUndefined();
    }
  });

  it('reads [package] and [lib] written as inline tables or dotted keys as it reads their table form', () => {
    // Issue 173: `package = { name = … }` gave no crate name, and `lib = { path = … }` no library path.
    const read = (text) => {
      const m = parseCargoManifest(text);
      return { crateName: m.crateName, libPath: m.libPath };
    };
    expect(read('[package]\nname = "shop-core"\n')).toEqual({ crateName: 'shop_core', libPath: undefined });
    expect(read('package = { name = "shop-core", version = "0.1.0" }\n')).toEqual({ crateName: 'shop_core', libPath: undefined });
    expect(read('package.name = "shop-core"\n[dependencies]\n')).toEqual({ crateName: 'shop_core', libPath: undefined });
    const lib = { crateName: 'api', libPath: 'api/lib.rs' };
    expect(read('[package]\nname = "kit"\n[lib]\nname = "api"\npath = "api/lib.rs"\n')).toEqual(lib);
    expect(read('package = { name = "kit" }\nlib = { name = "api", path = "api/lib.rs" }\n')).toEqual(lib);
    expect(read('lib.name = "api"\nlib.path = "api/lib.rs"\n[package]\nname = "kit"\n')).toEqual(lib);
    expect(read('package = {\n  name = "kit",\n}\r\nlib = { "path" = \'api/lib.rs\', name = "api" }\r\n')).toEqual(lib);
    // An inline table under another key holds neither, and a package table holds no dependencies.
    const other = parseCargoManifest('workspace = { package = { name = "ws" } }\nmetadata = { lib = { path = "x.rs" } }\npackage = { dependencies = { kit = { path = "../kit" } } }\n');
    expect({ crateName: other.crateName, libPath: other.libPath, dependencies: other.dependencies }).toEqual({ crateName: undefined, libPath: undefined, dependencies: new Map() });
  });

  it('ignores a `name` outside [package] / [lib]', () => {
    expect(parseCargoManifest('[[bin]]\nname = "tool"\n').crateName).toBeUndefined();
  });

  it('splits a dotted key in a dependency table into the crate and its field, as the inline-table form reads', () => {
    // Issue 015: `shop-core.workspace = true` was stored as a dependency called `shop-core.workspace`.
    const deps = (text) => parseCargoManifest(text).dependencies;
    const inline = deps('[dependencies]\nshop-core = { workspace = true }\n');
    expect(deps('[dependencies]\nshop-core.workspace = true\n')).toEqual(inline);
    expect(deps('[dependencies]\nshop-core.workspace = true\n')).toEqual(new Map([['shop-core', { workspace: true }]]));
    expect(deps('[dependencies]\nshop-core.path = "../core"\n')).toEqual(new Map([['shop-core', { path: '../core', workspace: false }]]));
    expect(deps('[dev-dependencies]\nshop-core.workspace = true\n')).toEqual(new Map([['shop-core', { workspace: true }]]));
    expect(deps("[target.'cfg(unix)'.build-dependencies]\nshop-core.path = '../core'\n")).toEqual(new Map([['shop-core', { path: '../core', workspace: false }]]));
    // Quoted segments and whitespace around the dot are the same key.
    expect(deps('[dependencies]\n"shop-core".path = "../core"\n')).toEqual(new Map([['shop-core', { path: '../core', workspace: false }]]));
    expect(deps("[dependencies]\n'shop-core' . path = \"../core\"\n")).toEqual(new Map([['shop-core', { path: '../core', workspace: false }]]));
    // A quoted key holding a dot stays one key.
    expect(deps('[dependencies]\n"a.b" = { path = "../ab" }\n')).toEqual(new Map([['a.b', { path: '../ab', workspace: false }]]));
    expect(parseCargoManifest('[workspace.dependencies]\nshop-core.path = "crates/core"\n').workspaceDependencies).toEqual(new Map([['shop-core', { path: 'crates/core', workspace: false }]]));
  });

  it('merges the dotted lines of one crate into one spec; another field only declares the crate', () => {
    const { dependencies } = parseCargoManifest(
      ['[dependencies]', 'kit.path = "../kit"', 'kit.version = "0.1"', 'kit.package = "kit-pkg"', 'kit.features = ["x"]', 'other.version = "1"', 'odd.path.deeper = "x"'].join('\n') + '\n',
    );
    expect(dependencies).toEqual(
      new Map([
        ['kit', { path: '../kit', package: 'kit-pkg', workspace: false }],
        ['other', { workspace: false }],
        ['odd', { workspace: false }],
      ]),
    );
  });

  it('keeps the first table that declares a crate, for dotted lines as for whole values', () => {
    // A crate declared in [dependencies] is not extended by a later table, whichever form either uses.
    const whole = parseCargoManifest('[dependencies]\nkit = "1"\n\n[dev-dependencies]\nkit = { path = "../kit" }\n').dependencies;
    const dotted = parseCargoManifest('[dependencies]\nkit.version = "1"\n\n[dev-dependencies]\nkit.path = "../kit"\n').dependencies;
    expect(whole).toEqual(new Map([['kit', { workspace: false }]]));
    expect(dotted).toEqual(whole);
    // A dotted line after a whole value of the same crate in the same table (invalid TOML) extends nothing either.
    expect(parseCargoManifest('[dependencies]\nkit = "1"\nkit.path = "../kit"\n').dependencies).toEqual(whole);
  });

  it('keeps the first declaration of a crate against a later [dependencies.<name>] table too, so one rule holds for every form', () => {
    // Issue 136: a `[dependencies.<name>]` table filled the entry an earlier declaration had made, while a later whole value or dotted line left it alone.
    const first = new Map([['kit', { workspace: false }]]);
    expect(parseCargoManifest('[dependencies]\nkit = "1"\n\n[dependencies.kit]\npath = "../kit"\n').dependencies).toEqual(first);
    expect(parseCargoManifest('[dependencies]\nkit = "1"\n\n[dev-dependencies.kit]\npath = "../kit"\npackage = "kit-pkg"\n').dependencies).toEqual(first);
    expect(parseCargoManifest('[dependencies]\nkit.version = "1"\n\n[build-dependencies.kit]\nworkspace = true\n').dependencies).toEqual(first);
    expect(parseCargoManifest('[workspace.dependencies]\nkit = "1"\n\n[workspace.dependencies.kit]\npath = "libs/kit"\n').workspaceDependencies).toEqual(first);
    // A table that declares the crate first keeps its own fields; a later table of the same crate extends nothing.
    expect(parseCargoManifest('[dependencies.kit]\npath = "../kit"\n\n[dev-dependencies.kit]\npath = "../other"\npackage = "kit-pkg"\n').dependencies).toEqual(
      new Map([['kit', { path: '../kit', workspace: false }]]),
    );
  });

  it('reads a dotted key that names the dependency table itself, above the first header or inside [workspace] / [target.<cfg>]', () => {
    // Issue 135: `dependencies.kit.path` above the first header and `dependencies.kit.path` inside [workspace] were ignored.
    const kit = new Map([['kit', { path: '../kit', workspace: false }]]);
    const parsed = (text) => parseCargoManifest(text);
    expect(parsed('dependencies.kit.path = "../kit"\n\n[package]\nname = "app"\n').dependencies).toEqual(kit);
    expect(parsed('dependencies.kit = { path = "../kit" }\n').dependencies).toEqual(kit);
    expect(parsed('dev-dependencies."kit".path = "../kit"\n').dependencies).toEqual(kit);
    expect(parsed("target.'cfg(unix)'.build-dependencies.kit.path = '../kit'\n").dependencies).toEqual(kit);
    expect(parsed("[target.'cfg(unix)']\ndependencies.kit.path = \"../kit\"\n").dependencies).toEqual(kit);
    expect(parsed('dependencies.kit.workspace = true\n').dependencies).toEqual(new Map([['kit', { workspace: true }]]));
    const ws = new Map([['kit', { path: 'libs/kit', workspace: false }]]);
    expect(parsed('[workspace]\nmembers = ["libs/*"]\ndependencies.kit.path = "libs/kit"\n').workspaceDependencies).toEqual(ws);
    expect(parsed('[workspace]\ndependencies.kit = { path = "libs/kit" }\n').workspaceDependencies).toEqual(ws);
    expect(parsed('workspace.dependencies.kit.path = "libs/kit"\n').workspaceDependencies).toEqual(ws);
    // One table above the first header can hold both maps; each crate merges its own lines.
    const both = parsed('workspace.dependencies.kit.path = "libs/kit"\ndependencies.kit.workspace = true\ndependencies.kit.package = "kit-pkg"\n');
    expect(both.workspaceDependencies).toEqual(ws);
    expect(both.dependencies).toEqual(new Map([['kit', { package: 'kit-pkg', workspace: true }]]));
    // The first declaration keeps the crate here too, and keys that name no crate declare nothing.
    expect(parsed('dependencies.kit.path = "../kit"\n\n[dependencies]\nkit = { path = "../other" }\n').dependencies).toEqual(kit);
    expect(parsed('package.name = "x"\nworkspace.members = ["a"]\n[workspace]\nresolver = "2"\n').dependencies).toEqual(new Map());
  });

  it('reads the fields written after a multi-line array inside an inline table (the zed shape)', () => {
    // Issue 149: the line-by-line reader stopped at the first line of `features = [`, so `package` (zed's reqwest and xim) or a `path` after the array was lost.
    const { dependencies, workspaceDependencies } = parseCargoManifest(
      [
        '[workspace.dependencies]',
        'reqwest = { git = "https://github.com/zed-industries/reqwest.git", rev = "33bc764aa15ff7b200bf7c93bd96e24878d53e14", default-features = false, features = [',
        '    "charset",',
        '    "http2",',
        '], package = "zed-reqwest", version = "0.12.15-zed" }',
        'next = { path = "crates/next" }',
        '',
        '[dependencies]',
        'kit = { git = "https://example.com/a[b{c", features = [ # a comment with ] and }',
        '  "a]",',
        "  ['nested', \"}\"],",
        '], path = "../kit" }',
        'tail = { path = "../tail" }',
        'list.features = [',
        '  "x",',
        ']',
        'list.path = "../list"',
      ].join('\n') + '\n',
    );
    expect(workspaceDependencies).toEqual(
      new Map([
        ['reqwest', { path: undefined, package: 'zed-reqwest', workspace: false }],
        ['next', { path: 'crates/next', package: undefined, workspace: false }],
      ]),
    );
    expect(dependencies).toEqual(
      new Map([
        ['kit', { path: '../kit', package: undefined, workspace: false }],
        ['tail', { path: '../tail', package: undefined, workspace: false }],
        ['list', { path: '../list', workspace: false }],
      ]),
    );
    // Joining lines follows strings: a multi-line string is one value, so its content is never read as a table header or an entry.
    expect(parseCargoManifest('[package]\nname = "app"\ndescription = """\n[dependencies]\nghost = { path = "../ghost" }\n"""\n').dependencies).toEqual(new Map());
  });

  it('reads a dependency table written as one inline table as it reads the [dependencies] table, LF and CRLF', () => {
    // Issue 163: `dependencies = { kit = { path = … } }` named no crate by its key path, so its entries were ignored.
    const table = '[dependencies]\nkit = { path = "../kit", features = ["a, b", \'}\'], package = "kit-pkg" }\nnext = "1"\nmore.path = "../more"\n';
    const inline = 'dependencies = { kit = { path = "../kit", features = ["a, b", \'}\'], package = "kit-pkg" }, next = "1", more.path = "../more" }\n';
    const expected = parseCargoManifest(table).dependencies;
    expect(expected.size).toBe(3);
    for (const text of [inline, inline.replace(/\n/g, '\r\n'), `[package]\nname = "app"\n[target.'cfg(unix)']\n${inline}`, `target = { 'cfg(unix)' = { ${inline.trim()} } }\n`, 'dependencies = {\n  kit = { path = "../kit", features = ["a, b", \'}\'], package = "kit-pkg" },\n  next = "1",\n  more.path = "../more",\n}\n']) {
      expect(parseCargoManifest(text).dependencies, text).toEqual(expected);
    }
    const ws = new Map([['kit', { path: 'libs/kit', package: undefined, workspace: false }]]);
    expect(parseCargoManifest('workspace = { dependencies = { kit = { path = "libs/kit" } } }\n').workspaceDependencies).toEqual(ws);
    expect(parseCargoManifest('[workspace]\ndependencies = { kit = { path = "libs/kit" } }\n').workspaceDependencies).toEqual(ws);
    expect(parseCargoManifest('dev-dependencies = { kit = { workspace = true } }\n').dependencies).toEqual(new Map([['kit', { path: undefined, package: undefined, workspace: true }]]));
    // The first declaration keeps the crate across forms, and an inline table elsewhere, or a member that is no `key = value`, declares nothing.
    expect(parseCargoManifest('dependencies = { kit = "1" }\n[dev-dependencies]\nkit = { path = "../kit" }\n').dependencies).toEqual(new Map([['kit', { workspace: false }]]));
    expect(parseCargoManifest('package = { dependencies = { kit = { path = "../kit" } } }\nfeatures = { kit = { path = "../kit" } }\ndependencies = { kit }\n').dependencies).toEqual(new Map());
  });

  it('joins the lines of a CRLF file the same way, so an entry with a multi-line array keeps the fields before and after it', () => {
    // Issue 149, round 2: the join kept each `\r`, the joined line no longer matched `key = value`, and the whole entry was dropped.
    const lf = '[dependencies]\nkit = { path = "../kit", features = [\n    "a",\n    "b", # comment\n], package = "kit-pkg" }\nnext = { path = "../next" }\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    const expected = new Map([
      ['kit', { path: '../kit', package: 'kit-pkg', workspace: false }],
      ['next', { path: '../next', package: undefined, workspace: false }],
    ]);
    expect(parseCargoManifest(lf).dependencies).toEqual(expected);
    expect(parseCargoManifest(crlf).dependencies).toEqual(expected);
  });

  it('stops joining at a line that opens a table header, so a bracket left open in invalid TOML can lose an entry but never invent one', () => {
    // A `]` missing from `features` would otherwise swallow the next table and hand `bar`'s path to `foo`.
    const text = '[dependencies]\nfoo = { version = "1", features = ["a" }\n\n[dev-dependencies]\nbar = { path = "../bar" }\n';
    for (const t of [text, text.replace(/\n/g, '\r\n')]) {
      expect(parseCargoManifest(t).dependencies).toEqual(
        new Map([
          ['foo', { path: undefined, package: undefined, workspace: false }],
          ['bar', { path: '../bar', package: undefined, workspace: false }],
        ]),
      );
    }
    // The same for a one-line string left open inside an inline table, and for a header written below a nested table.
    expect(parseCargoManifest('[dependencies]\nfoo = { git = "https://x, features = [\n[target.\'cfg(unix)\'.dependencies]\nbar.path = "../bar"\n').dependencies.get('bar')).toEqual({ path: '../bar', workspace: false });
    // A nested array element that is not a header keeps the join.
    expect(parseCargoManifest('[dependencies]\nkit = { features = [\n  ["a", "b"],\n  [1, 2]\n], path = "../kit" }\n').dependencies.get('kit')).toEqual({ path: '../kit', package: undefined, workspace: false });
  });

  it('matches a declared or used name as a whole word only', () => {
    expect(rustFileDeclares('pub struct Engine;', 'Engine')).toBe(true);
    expect(rustFileDeclares('pub struct EngineRoom;', 'Engine')).toBe(false);
    expect(rustFileDeclares('pub use a::{b::Engine, c};', 'Engine')).toBe(true);
    expect(rustFileDeclares('fn f() { let Engine = 1; }', 'Engine')).toBe(false);
    expect(rustFileDeclares('pub mod r#gen;', 'gen')).toBe(true);
  });

  it('counts an `extern crate` binding as a name the file declares: the alias when renamed, else the crate', () => {
    // Issue 137: ripgrep's facade crate `grep` re-exports its parts as `pub extern crate grep_printer as printer;`, so `grep::printer::…` found no declaration in grep's lib.rs and stayed silent.
    expect(rustFileDeclares('pub extern crate grep_printer as printer;', 'printer')).toBe(true);
    expect(rustFileDeclares('pub extern crate grep_printer as printer;', 'grep_printer')).toBe(false);
    expect(rustFileDeclares('#[macro_use]\nextern crate log;', 'log')).toBe(true);
    expect(rustFileDeclares('extern crate r#async as r#await ;', 'await')).toBe(true);
    expect(rustFileDeclares('extern crate self as facade;', 'facade')).toBe(true);
    expect(rustFileDeclares('extern crate printers;', 'printer')).toBe(false);
  });
});

describe('resolveRustPath — manifest and target edge forms (disk-backed)', () => {
  let ws;
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
    writeFileSync(path.join(ws, rel), text, 'utf-8');
  };
  beforeEach(() => {
    ws = mkdtempSync(path.join(tmpdir(), 'rust-manifest-'));
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it('build.rs is a crate root at the package directory', () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('gen_helpers.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('self::gen_helpers', 'build.rs', 'rust')).toBe('gen_helpers.rs');
  });

  it('reads table-form and workspace table-form dependencies, single-quoted fields and multi-line arrays', () => {
    put(
      'Cargo.toml',
      "[package]\nname = \"rootlib\"\n\n[workspace]\nmembers = [\n  \"crates/*\",\n]\n\n[workspace.dependencies.kit]\npath = 'crates/kit'\npackage = 'kit-pkg'\n",
    );
    put('src/lib.rs', 'pub struct Top;\n');
    put('crates/kit/Cargo.toml', '[package]\nname = "kit-pkg"\n');
    put('crates/kit/src/lib.rs', 'pub struct Kit;\n');
    put('crates/anon/Cargo.toml', '[lib]\npath = "src/lib.rs"\n');
    put('crates/anon/src/lib.rs', 'pub struct Anon;\n');
    put(
      'crates/app/Cargo.toml',
      [
        '[package]',
        'name = "app"',
        '',
        '[dependencies.kit]',
        'workspace = true',
        '',
        '[dependencies.top]',
        "path = '../..'",
        "package = 'rootlib'",
        '',
        '[dependencies]',
        'anon = { path = "../anon" }',
        'ghost = { workspace = true }',
      ].join('\n') + '\n',
    );
    const from = 'crates/app/src/main.rs';
    const resolve = makeResolvePathToFile(ws);
    // Workspace-inherited, renamed in the workspace table: code uses the key `kit`.
    expect(resolve('kit::Kit', from, 'rust')).toBe('crates/kit/src/lib.rs');
    // A path dependency on the repository-root package, renamed in the table form.
    expect(resolve('top::Top', from, 'rust')).toBe('src/lib.rs');
    // A dependency crate with no package name is called by its key.
    expect(resolve('anon::Anon', from, 'rust')).toBe('crates/anon/src/lib.rs');
    // `workspace = true` with no workspace entry anywhere → silence.
    expect(resolve('ghost::X', from, 'rust')).toBeUndefined();
  });

  it('resolves dependencies written with dotted keys: `.workspace = true`, `.path`, in [workspace.dependencies] and [dev-dependencies]', () => {
    // Issue 015, the reproduction's cases A, D, F and G: each was silent while the inline-table form gave the edge.
    put('Cargo.toml', '[workspace]\nmembers = ["crates/*"]\n\n[workspace.dependencies]\nshop-core.path = "crates/core"\n');
    put('crates/core/Cargo.toml', '[package]\nname = "shop-core"\n');
    put('crates/core/src/lib.rs', 'pub struct Order;\n');
    put('crates/a/Cargo.toml', '[package]\nname = "a"\n\n[dependencies]\nshop-core.workspace = true\n');
    put('crates/d/Cargo.toml', '[package]\nname = "d"\n\n[dependencies]\nshop-core.path = "../core"\n');
    put('crates/f/Cargo.toml', '[package]\nname = "f"\n\n[dependencies]\nshop-core = { workspace = true }\n');
    put('crates/g/Cargo.toml', '[package]\nname = "g"\n\n[dev-dependencies]\nshop-core.workspace = true\n');
    const resolve = makeResolvePathToFile(ws);
    for (const pkg of ['a', 'd', 'f', 'g']) {
      expect(resolve('shop_core::Order', `crates/${pkg}/src/main.rs`, 'rust'), pkg).toBe('crates/core/src/lib.rs');
    }
  });

  it('resolves a path dependency whose path follows a multi-line features array in its inline table', () => {
    // Issue 149: `path` after `features = [ … ]` spread over lines was never read, so the import was silent.
    put('Cargo.toml', '[package]\nname = "app"\n\n[dependencies]\nkit = { version = "0.1", features = [\n    "x",\n    "y",\n], path = "libs/kit" }\n');
    put('libs/kit/Cargo.toml', '[package]\nname = "kit"\n');
    put('libs/kit/src/lib.rs', 'pub struct Engine;\n');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('kit::Engine', 'src/main.rs', 'rust')).toBe('libs/kit/src/lib.rs');
  });

  it('binds a path through a dependency\'s re-exported extern crate to that dependency\'s crate root file', () => {
    // Issue 137, the ripgrep shape: `rg` uses `grep::printer::Standard`, and the facade crate `grep` declares `printer` only as `pub extern crate grep_printer as printer;`.
    put('Cargo.toml', '[package]\nname = "app"\n\n[dependencies]\ngrep = { path = "crates/grep" }\n');
    put('crates/grep/Cargo.toml', '[package]\nname = "grep"\n\n[dependencies]\ngrep-printer = { path = "../printer" }\n');
    put('crates/grep/src/lib.rs', 'pub extern crate grep_printer as printer;\n');
    put('crates/printer/Cargo.toml', '[package]\nname = "grep-printer"\n');
    put('crates/printer/src/lib.rs', 'pub struct Standard;\n');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('grep::printer::Standard', 'crates/core/flags/hiargs.rs', 'rust')).toBe('crates/grep/src/lib.rs');
    expect(resolve('grep::searcher::Searcher', 'crates/core/flags/hiargs.rs', 'rust')).toBeUndefined();
  });

  it('walks past an intermediate manifest to the workspace that defines an inherited dependency', () => {
    put('Cargo.toml', '[workspace]\n\n[workspace.dependencies]\nkit = { path = "libs/kit" }\n');
    put('libs/kit/Cargo.toml', '[package]\nname = "kit"\n');
    put('libs/kit/src/lib.rs', 'pub struct Kit;\n');
    put('apps/Cargo.toml', '[workspace]\n');
    put('apps/web/Cargo.toml', '[package]\nname = "web"\n\n[dependencies]\nkit = { workspace = true }\n');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('kit::Kit', 'apps/web/src/main.rs', 'rust')).toBe('libs/kit/src/lib.rs');
  });

  it('a [lib] path that leaves the repository falls back to src/lib.rs', () => {
    put('Cargo.toml', '[package]\nname = "app"\n\n[lib]\npath = "../../outside.rs"\n');
    put('src/lib.rs', 'pub struct Here;\n');
    put('tests/it.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('app::Here', 'tests/it.rs', 'rust')).toBe('src/lib.rs');
  });

  it('no Cargo.toml anywhere → a bare crate name is not a dependency', () => {
    put('src/a.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('kit::Kit', 'src/a.rs', 'rust')).toBeUndefined();
  });
});

describe('resolveRustPath — crate-root lookup without a declares check (injected deps)', () => {
  it('binds the first existing root file when the deps supply no rootDeclares', () => {
    const deps = {
      crateRootFor: () => ({ srcDir: 'src', crateName: 'c', rootFiles: ['src/lib.rs'], fileIsRoot: false }),
    };
    const known = new Set(['src/lib.rs']);
    expect(resolveRustPath('crate::Anything', 'src/a.rs', (p) => known.has(p), deps)).toBe('src/lib.rs');
  });
});
