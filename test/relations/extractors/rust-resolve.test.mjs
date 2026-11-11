// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/rust-resolve.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect, beforeEach, afterEach } from '../../helpers/expect.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { makeResolvePathToFile, makeResolver, SymbolTable } from '@chrisdudek/runes/relations';
import { parseCargoManifest, rustFileDeclares, rustExtractor, topLevelItemNames, topLevelExternCrates, rustTopLevelItemKey, rustExternNameKey, rustExternBindingKey, plainModuleFiles, rustModuleFileKey, declaredModules, rustModuleKey, RUST_MODULES_KNOWN_KEY, pathModules } from '../../helpers/internal/relations.mjs';
import { resolveRustPath } from '../../helpers/internal/relations.mjs';
import { withParsedFile, parsedFile } from '../../helpers/tree-sitter.mjs';

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
    put('Cargo.toml', '[package]\nname = "app"\nautobins = false\n[[bin]]\nname = "app"\n[[bin]]\nname = "tool"\npath = "src/bin/tool/app.rs"\n[[bin]]\nname = "multi"\n');
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

  it('with bin discovery turned off, takes src/main.rs for a crate root only when a [[bin]] declares it, by its path or by the package name', () => {
    put('src/lib.rs', 'pub mod util;\n');
    put('src/util.rs', '');
    put('src/main.rs', 'mod cli;\npub struct Main;\n');
    put('src/cli.rs', '');
    put('src/bin/tool.rs', '');
    const resolve = (manifest, spec, from) => {
      put('Cargo.toml', `[package]\nname = "app"\nautobins = false\n${manifest}`);
      return makeResolvePathToFile(ws)(spec, from, 'rust');
    };
    // Undeclared: no crate root, so its `self::` reaches no module file beside it (the file is only its own module).
    expect(resolve('', 'self::cli::Args', 'src/main.rs')).toBe('src/main.rs');
    expect(resolve('[[bin]]\nname = "tool"\n', 'self::cli::Args', 'src/main.rs')).toBe('src/main.rs');
    // A file of src/bin/ that is no declared bin is a module of the library then, and src/main.rs is not tried for its crate-root items.
    expect(resolve('', 'crate::util::Thing', 'src/bin/tool.rs')).toBe('src/util.rs');
    expect(resolve('', 'crate::Main', 'src/bin/tool.rs')).toBeUndefined();
    // Declared by its path, or by a bin named like the package, it is the root again.
    expect(resolve('[[bin]]\nname = "x"\npath = "src/main.rs"\n', 'self::cli::Args', 'src/main.rs')).toBe('src/cli.rs');
    expect(resolve('[[bin]]\nname = "app"\n', 'self::cli::Args', 'src/main.rs')).toBe('src/cli.rs');
    expect(resolve('[[bin]]\nname = "app"\n', 'crate::Main', 'src/bin/tool.rs')).toBe('src/main.rs');
    // With discovery on it is a root with nothing declared.
    put('Cargo.toml', '[package]\nname = "app"\n');
    expect(makeResolvePathToFile(ws)('self::cli::Args', 'src/main.rs', 'rust')).toBe('src/cli.rs');
    // A library outside src/ and no root in src/ leave a src/bin file the src/ tree with no root file to bind items to.
    put('Cargo.toml', '[package]\nname = "app"\nautobins = false\n[lib]\npath = "lib/lib.rs"\n');
    expect(makeResolvePathToFile(ws)('crate::util::Thing', 'src/bin/tool.rs', 'rust')).toBe('src/util.rs');
    expect(makeResolvePathToFile(ws)('crate::Main', 'src/bin/tool.rs', 'rust')).toBeUndefined();
  });

  it('in edition 2015 roots a bin whose name two inferred targets share at its legacy path alone', () => {
    put('Cargo.toml', '[package]\nname = "app"\n[[bin]]\nname = "app"\n');
    put('src/main.rs', 'mod cli;\npub struct Main;\n');
    put('src/cli.rs', '');
    put('src/bin/app.rs', 'pub struct Other;\n');
    const resolve = makeResolvePathToFile(ws);
    // src/main.rs and src/bin/app.rs both carry the package's name: with no src/app.rs the legacy path is src/main.rs, and src/bin/app.rs is a module of it.
    expect(resolve('self::cli::Args', 'src/main.rs', 'rust')).toBe('src/cli.rs');
    expect(resolve('crate::Main', 'src/bin/app.rs', 'rust')).toBe('src/main.rs');
  });

  it('in edition 2015 keeps both inferred roots of a bin whose name they share when no legacy path exists, where Cargo refuses the manifest', () => {
    put('Cargo.toml', '[package]\nname = "app"\n[[bin]]\nname = "tool"\n');
    put('src/lib.rs', '');
    put('src/bin/tool.rs', 'pub struct Tool;\n');
    put('src/bin/tool/main.rs', 'mod ui;\n');
    put('src/bin/tool/ui.rs', '');
    const resolve = makeResolvePathToFile(ws);
    expect(resolve('crate::ui', 'src/bin/tool/main.rs', 'rust')).toBe('src/bin/tool/ui.rs');
    expect(resolve('crate::Tool', 'src/bin/tool.rs', 'rust')).toBe('src/bin/tool.rs');
  });

  it('in edition 2015 finds a written [lib] with no path at src/<name>.rs when src/lib.rs is missing, and nowhere else', () => {
    put('src/my_kit.rs', 'mod tools;\npub struct Kit;\n');
    put('src/tools.rs', '');
    const resolve = (manifest) => {
      put('Cargo.toml', manifest);
      return makeResolvePathToFile(ws)('crate::Kit', 'src/tools.rs', 'rust');
    };
    // The [lib] table in any spelling, and the crate name with its dash made an underscore.
    expect(resolve('[package]\nname = "my-kit"\n[lib]\n')).toBe('src/my_kit.rs');
    expect(resolve('lib.doctest = false\n[package]\nname = "my-kit"\n')).toBe('src/my_kit.rs');
    expect(resolve('lib = {}\n[package]\nname = "my-kit"\n')).toBe('src/my_kit.rs');
    // No [lib] table, edition 2018, or a [lib] path: no library at src/<name>.rs.
    expect(resolve('[package]\nname = "my-kit"\n')).toBeUndefined();
    expect(resolve('[package]\nname = "my-kit"\nedition = "2018"\n[lib]\n')).toBeUndefined();
    expect(resolve('[package]\nname = "my-kit"\n[lib]\npath = "lib/lib.rs"\n')).toBeUndefined();
    // src/lib.rs, when it exists, is the library.
    put('src/lib.rs', 'pub struct Kit;\n');
    expect(resolve('[package]\nname = "my-kit"\n[lib]\n')).toBe('src/lib.rs');
  });

  it('reads an empty bin array as declaring bins: in edition 2015 bin discovery is off, from 2018 on it stays on', () => {
    put('src/main.rs', 'mod cli;\n');
    put('src/cli.rs', '');
    const resolve = (manifest) => {
      put('Cargo.toml', manifest);
      return makeResolvePathToFile(ws)('self::cli::Args', 'src/main.rs', 'rust');
    };
    expect(resolve('bin = []\n[package]\nname = "app"\n')).toBe('src/main.rs');
    expect(resolve('bin = [\n]\n[package]\nname = "app"\nautobins = true\n')).toBe('src/cli.rs');
    expect(resolve('bin = []\n[package]\nname = "app"\nedition = "2018"\n')).toBe('src/cli.rs');
    // A value that is no array declares nothing.
    expect(resolve('bin = "x"\n[package]\nname = "app"\n')).toBe('src/cli.rs');
  });

  // The pass's symbol table over every Rust file of the workspace as it stands now, built from the extractor's declarations as a consumer builds it: it is what tells which names a crate root binds at its top level, which an edition 2015 `use` path needs.
  const tableNow = async () => {
    const table = new SymbolTable();
    for (const rel of readdirSync(ws, { recursive: true }).map((p) => p.split(path.sep).join('/')).filter((p) => p.endsWith('.rs')).sort()) {
      const code = readFileSync(path.join(ws, rel), 'utf-8');
      await withParsedFile(rel, code, (tree) => {
        for (const d of rustExtractor.declarations(parsedFile(rel, code, tree, 'rust'))) table.declare('rust', d.symbolKey, rel);
      });
    }
    return table;
  };

  it('reads a use path as relative to the crate root in edition 2015 only through the pass\'s symbol table, which says what the root binds', async () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('src/lib.rs', 'mod shapes;\n');
    put('src/shapes.rs', '');
    put('src/api/client.rs', '');
    // Without the table no name is known to be an item of the root, so the path stays silent; through the resolver it binds.
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'src/api/client.rs', 'rust')).toBeUndefined();
    const table = await tableNow();
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'src/api/client.rs', 'rust', false, table)).toBe('src/shapes.rs');
    const resolver = makeResolver({ ownerIndex: { ownerOf: (f) => path.posix.dirname(f) }, symbolTable: table, resolvePathToFile: makeResolvePathToFile(ws) });
    expect(resolver.resolveFile({ kind: 'path', specifier: 'shapes::Circle' }, 'src/api/client.rs', 'rust')).toBe('src/shapes.rs');
    // The same tables answer a crate:: path from the file's text, as before.
    expect(makeResolvePathToFile(ws)('crate::shapes::Circle', 'src/api/client.rs', 'rust', false, table)).toBe('src/shapes.rs');
  });

  it('binds a crate root for a crate:: path or a path into a dependency by what its parse tree binds at the top level, and by its text only without the pass\'s symbol table', async () => {
    put('Cargo.toml', '[package]\nname = "app"\nedition = "2021"\n\n[dependencies]\nkit = { path = "kit" }\n');
    put('src/lib.rs', 'pub const HELP: &str = "call fn ensure first";\nfn setup() { fn nested() {} }\nmod inner { pub struct Deep; }\npub struct Top;\npub use std::fmt::Debug as Shown;\npub extern crate kit as tools;\n');
    put('src/api/mod.rs', '');
    put('kit/Cargo.toml', '[package]\nname = "kit"\nedition = "2021"\n');
    put('kit/src/lib.rs', '// struct Ghost;\npub struct Real;\nconst S: &str = "struct Quoted;";\n');
    const table = await tableNow();
    const resolve = makeResolvePathToFile(ws);
    const withTable = (specifier) => resolve(specifier, 'src/api/mod.rs', 'rust', false, table);
    for (const name of ['Top', 'Shown', 'tools', 'HELP', 'setup', 'inner']) expect(withTable(`crate::${name}`), name).toBe('src/lib.rs');
    for (const name of ['ensure', 'nested', 'Deep', 'Debug', 'kit', 'Missing']) expect(withTable(`crate::${name}`), name).toBeUndefined();
    expect(withTable('kit::Real')).toBe('kit/src/lib.rs');
    expect(withTable('kit::Ghost')).toBeUndefined();
    expect(withTable('kit::Quoted')).toBeUndefined();
    // Without the table there is no parse tree: the text is read, as 1.0 read it, and a word in a string or a nested item passes for a declaration.
    const withoutTable = (specifier) => resolve(specifier, 'src/api/mod.rs', 'rust');
    for (const name of ['Top', 'ensure', 'nested', 'Deep']) expect(withoutTable(`crate::${name}`), name).toBe('src/lib.rs');
    expect(withoutTable('kit::Quoted')).toBe('kit/src/lib.rs');
    expect(withoutTable('kit::Ghost')).toBeUndefined();
    // A root file the pass did not extract binds nothing.
    const partial = new SymbolTable();
    partial.declare('rust', rustTopLevelItemKey('Real'), 'src/api/mod.rs');
    expect(resolve('crate::Top', 'src/api/mod.rs', 'rust', false, partial)).toBeUndefined();
    expect(resolve('kit::Real', 'src/api/mod.rs', 'rust', false, partial)).toBeUndefined();
  });

  it('follows a name bound with extern crate to its crate: from the crate root in every module, from another module in that module only', async () => {
    put('Cargo.toml', '[package]\nname = "app"\nedition = "2021"\n\n[dependencies]\nengine-core = { path = "engine-core" }\nrenamed = { path = "other", package = "other-kit" }\nserde = "1"\n');
    put('engine-core/Cargo.toml', '[package]\nname = "engine-core"\nedition = "2021"\n');
    put('engine-core/src/lib.rs', 'pub struct Engine;\npub mod parts;\n');
    put('engine-core/src/parts.rs', 'pub struct Gear;\n');
    put('other/Cargo.toml', '[package]\nname = "other-kit"\nedition = "2021"\n');
    put('other/src/lib.rs', 'pub struct Kit;\n');
    put('src/lib.rs', 'extern crate engine_core as core2;\nextern crate renamed as rn;\nextern crate serde as ser;\nextern crate self as me;\nextern crate app as again;\npub struct Own;\n');
    put('src/main.rs', 'fn main() {}\n');
    put('src/api/mod.rs', 'extern crate engine_core as local;\n');
    put('src/other/mod.rs', '');
    const table = await tableNow();
    const resolve = makeResolvePathToFile(ws);
    const from = (file, specifier) => resolve(specifier, file, 'rust', false, table);
    for (const file of ['src/lib.rs', 'src/api/mod.rs', 'src/other/mod.rs']) {
      expect(from(file, 'core2::Engine'), file).toBe('engine-core/src/lib.rs');
      expect(from(file, 'core2::parts::Gear'), file).toBe('engine-core/src/parts.rs');
      expect(from(file, 'rn::Kit'), file).toBe('other/src/lib.rs');
      // The package's own library, bound under another name.
      expect(from(file, 'again::Own'), file).toBe('src/lib.rs');
      // A registry crate under an alias, and the crate itself under one, name nothing to follow.
      expect(from(file, 'ser::Serialize'), file).toBeUndefined();
      expect(from(file, 'me::Own'), file).toBeUndefined();
    }
    // The alias of a module that is not the root is no name of the crate: a bare path that starts with it binds nothing, in that module's file either, whose inline modules are other scopes. The extractor emits a use of the alias's own scope as the crate and the path as written.
    for (const file of ['src/api/mod.rs', 'src/other/mod.rs', 'src/lib.rs']) expect(from(file, 'local::Engine'), file).toBeUndefined();
    expect(from('src/api/mod.rs', 'extern::engine_core::as::local::Engine')).toBe('engine-core/src/lib.rs');
    expect(from('src/api/mod.rs', 'extern::engine_core::as::local::parts::Gear')).toBe('engine-core/src/parts.rs');
    expect(from('src/api/mod.rs', 'extern::engine_core')).toBe('engine-core/src/lib.rs');
    expect(from('src/main.rs', 'extern::app')).toBe('src/lib.rs');
    expect(from('src/api/mod.rs', 'extern::serde')).toBeUndefined();
    expect(from('src/api/mod.rs', 'extern::serde::as::ser::Serialize')).toBeUndefined();
    expect(from('src/api/mod.rs', 'extern')).toBeUndefined();
    // Without the table no alias is known.
    expect(resolve('core2::Engine', 'src/other/mod.rs', 'rust')).toBeUndefined();
    // Edition 2015: a use path starts at the crate root, so the root's alias binds everywhere and a module's own alias nowhere.
    put('old/Cargo.toml', '[package]\nname = "old"\n\n[dependencies]\nengine-core = { path = "../engine-core" }\n');
    put('old/src/lib.rs', 'extern crate engine_core as core2;\n');
    put('old/src/api/mod.rs', 'extern crate engine_core as local;\n');
    const older = await tableNow();
    const resolveOld = makeResolvePathToFile(ws);
    expect(resolveOld('core2::Engine', 'old/src/api/mod.rs', 'rust', false, older)).toBe('engine-core/src/lib.rs');
    expect(resolveOld('extern::engine_core::as::local::Engine', 'old/src/api/mod.rs', 'rust', false, older)).toBeUndefined();
    expect(resolveOld('extern::engine_core::as::core2::Engine', 'old/src/lib.rs', 'rust', false, older)).toBe('engine-core/src/lib.rs');
    expect(resolveOld('extern::engine_core', 'old/src/api/mod.rs', 'rust', false, older)).toBe('engine-core/src/lib.rs');
  });

  it('in edition 2015 reaches a path dependency from a use only through the root\'s extern crate, and takes the root\'s own module of that name first', async () => {
    const manifest = (edition) => `[package]\nname = "app"\n${edition}\n[dependencies]\nutil = { path = "../util" }\n`;
    put('util/Cargo.toml', '[package]\nname = "util"\n');
    put('util/src/lib.rs', 'pub fn slug() {}\n');
    // The root declares a module `util` and no extern crate.
    put('local/Cargo.toml', manifest(''));
    put('local/src/lib.rs', 'mod util;\nmod api;\n');
    put('local/src/util/mod.rs', 'pub fn slug() {}\n');
    put('local/src/api/mod.rs', 'use util::slug;\n');
    put('local/src/tool.rs', 'fn f() {\n    extern crate util;\n}\n');
    // The root binds nothing called `util`.
    put('bare/Cargo.toml', manifest(''));
    put('bare/src/lib.rs', 'pub struct Unrelated;\n');
    put('bare/src/api/mod.rs', 'use util::slug;\n');
    // The root writes the extern crate.
    put('linked/Cargo.toml', manifest(''));
    put('linked/src/lib.rs', '#[macro_use]\nextern crate util;\n');
    put('linked/src/api/mod.rs', 'use util::slug;\n');
    // Edition 2018: the dependency is in the extern prelude.
    put('newer/Cargo.toml', manifest('edition = "2018"'));
    put('newer/src/lib.rs', 'pub struct Unrelated;\n');
    put('newer/src/api/mod.rs', 'use util::slug;\n');
    const table = await tableNow();
    const resolve = makeResolvePathToFile(ws);
    const from = (file, specifier) => resolve(specifier, file, 'rust', false, table);
    expect(from('local/src/api/mod.rs', 'util::slug')).toBe('local/src/util/mod.rs');
    expect(from('local/src/lib.rs', 'util::slug')).toBe('local/src/util/mod.rs');
    // The declaration's own path names the crate, wherever it stands; a use beside it still starts at the crate root.
    expect(from('local/src/tool.rs', 'extern::util')).toBe('util/src/lib.rs');
    expect(from('local/src/tool.rs', 'util::slug')).toBe('local/src/util/mod.rs');
    expect(from('local/src/tool.rs', 'extern::util::as::util::slug')).toBe('local/src/util/mod.rs');
    expect(from('bare/src/api/mod.rs', 'util::slug')).toBeUndefined();
    expect(from('bare/src/lib.rs', 'util::slug')).toBeUndefined();
    expect(from('linked/src/api/mod.rs', 'util::slug')).toBe('util/src/lib.rs');
    expect(from('linked/src/lib.rs', 'extern::util')).toBe('util/src/lib.rs');
    expect(from('linked/src/lib.rs', 'extern::util::as::util::slug')).toBe('util/src/lib.rs');
    expect(from('newer/src/api/mod.rs', 'util::slug')).toBe('util/src/lib.rs');
    // Without the table what the root binds is not known, and the dependency binds as it does from 2018 on.
    expect(resolve('util::slug', 'bare/src/api/mod.rs', 'rust')).toBe('util/src/lib.rs');
    expect(resolve('util::slug', 'local/src/api/mod.rs', 'rust')).toBe('util/src/lib.rs');
  });

  it('reads a use path as relative to the crate root in edition 2015, which is also the default, and as an external crate from 2018 on', async () => {
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
    const table = await tableNow();
    const resolve = () => (spec, from, language) => makeResolvePathToFile(ws)(spec, from, language, false, table);
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

  it('in edition 2015 binds the crate root for a use path that names an item the root defines or imports, and not for an extern crate or an undefined name', async () => {
    put('Cargo.toml', '[package]\nname = "app"\n');
    put('src/lib.rs', 'extern crate serde;\npub use shapes::Circle;\npub enum Error { NotFound }\nmod shapes;\n');
    put('src/shapes.rs', '');
    put('src/api/client.rs', '');
    const table = await tableNow();
    const resolve = (spec, from, language) => makeResolvePathToFile(ws)(spec, from, language, false, table);
    expect(resolve('Error', 'src/api/client.rs', 'rust')).toBe('src/lib.rs');
    expect(resolve('Error::NotFound', 'src/api/client.rs', 'rust')).toBe('src/lib.rs');
    expect(resolve('Circle', 'src/api/client.rs', 'rust')).toBe('src/lib.rs');
    expect(resolve('shapes', 'src/api/client.rs', 'rust')).toBe('src/shapes.rs');
    expect(resolve('serde', 'src/api/client.rs', 'rust')).toBeUndefined();
    expect(resolve('Missing', 'src/api/client.rs', 'rust')).toBeUndefined();
    // The same root item is no `use` path from edition 2018 on.
    put('Cargo.toml', '[package]\nname = "app"\nedition = "2018"\n');
    expect(makeResolvePathToFile(ws)('Error', 'src/api/client.rs', 'rust', false, table)).toBeUndefined();
  });

  it('lets a target that writes an edition of its own decide how its files read use paths, by its path or its name', async () => {
    const lib = 'mod shapes;\n';
    put('src/lib.rs', lib);
    put('src/shapes.rs', '');
    put('src/api/client.rs', '');
    put('src/bin/tool.rs', 'mod local;\n');
    put('src/bin/local.rs', '');
    put('src/bin/multi/main.rs', 'mod ui;\n');
    put('src/bin/multi/ui.rs', '');
    put('tests/it.rs', 'mod helper;\n');
    put('tests/helper.rs', '');
    let table = await tableNow();
    const resolve = (manifest, spec, from) => {
      put('Cargo.toml', manifest);
      return makeResolvePathToFile(ws)(spec, from, 'rust', false, table);
    };
    const pkg = (edition, rest = '') => `[package]\nname = "app"\nedition = "${edition}"\n${rest}`;
    // [lib].edition decides the library's files; the package's edition holds for the rest.
    expect(resolve(pkg('2018', '[lib]\nedition = "2015"\n'), 'shapes::Circle', 'src/api/client.rs')).toBe('src/shapes.rs');
    expect(resolve(pkg('2015', '[lib]\nedition = "2021"\n'), 'shapes::Circle', 'src/api/client.rs')).toBeUndefined();
    expect(resolve(pkg('2018', '[lib]\nedition = "2015"\npath = "src/lib.rs"\n'), 'shapes::Circle', 'src/api/client.rs')).toBe('src/shapes.rs');
    // A bin given a name alone is rooted in src/bin/, and its edition is its own; so is the root of a bin directory, and a test target.
    expect(resolve(pkg('2018', '[[bin]]\nname = "tool"\nedition = "2015"\n'), 'local::Thing', 'src/bin/tool.rs')).toBe('src/bin/local.rs');
    expect(resolve(pkg('2015', '[[bin]]\nname = "tool"\nedition = "2018"\n'), 'local::Thing', 'src/bin/tool.rs')).toBeUndefined();
    expect(resolve(pkg('2018', '[[bin]]\nname = "multi"\nedition = "2015"\n'), 'ui::Widget', 'src/bin/multi/main.rs')).toBe('src/bin/multi/ui.rs');
    expect(resolve(pkg('2018', '[[bin]]\nname = "tool"\nedition = "2015"\n'), 'ui::Widget', 'src/bin/multi/main.rs')).toBeUndefined();
    expect(resolve(pkg('2018', '[[test]]\nname = "it"\nedition = "2015"\n'), 'helper::Util', 'tests/it.rs')).toBe('tests/helper.rs');
    // The edition of one target does not leak to another: the library keeps the package's.
    expect(resolve(pkg('2018', '[[bin]]\nname = "tool"\nedition = "2015"\n'), 'shapes::Circle', 'src/api/client.rs')).toBeUndefined();
    // A bin named like the package and given no path is rooted at src/main.rs.
    put('src/main.rs', 'mod shapes;\n');
    put('src/lib.rs', '');
    table = await tableNow();
    expect(resolve(pkg('2018', '[[bin]]\nname = "app"\nedition = "2015"\n'), 'shapes::Circle', 'src/main.rs')).toBe('src/shapes.rs');
    expect(resolve(pkg('2018', '[[bin]]\nname = "other"\nedition = "2015"\n'), 'shapes::Circle', 'src/main.rs')).toBeUndefined();
    // A module of both the library and the binary is read in two editions when they differ, so it is not told; it is when they agree.
    put('src/lib.rs', 'mod shapes;\n');
    table = await tableNow();
    expect(resolve(pkg('2018', '[[bin]]\nname = "app"\nedition = "2015"\n'), 'shapes::Circle', 'src/api/client.rs')).toBeUndefined();
    expect(resolve(pkg('2015', '[[bin]]\nname = "app"\nedition = "2021"\n'), 'shapes::Circle', 'src/api/client.rs')).toBeUndefined();
    expect(resolve(pkg('2018', '[lib]\nedition = "2015"\n[[bin]]\nname = "app"\nedition = "2015"\n'), 'shapes::Circle', 'src/api/client.rs')).toBe('src/shapes.rs');
    // An edition written other than as a string, or a table with no name and no path, is no edition of any target.
    expect(resolve(pkg('2018', '[[bin]]\nname = "app"\nedition = 2015\n[[bin]]\nedition = "2015"\n'), 'shapes::Circle', 'src/main.rs')).toBeUndefined();
  });

  it('takes the edition from the workspace for `edition.workspace = true`, and treats a workspace that gives none as unknown', async () => {
    put('Cargo.toml', '[workspace]\nmembers = ["crates/a"]\n[workspace.package]\nedition = "2015"\n');
    put('crates/a/Cargo.toml', '[package]\nname = "a"\nedition.workspace = true\n');
    put('crates/a/src/lib.rs', 'mod shapes;\n');
    put('crates/a/src/shapes.rs', '');
    put('crates/a/src/api/client.rs', '');
    let table = await tableNow();
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'crates/a/src/api/client.rs', 'rust', false, table)).toBe('crates/a/src/shapes.rs');
    put('Cargo.toml', '[workspace]\nmembers = ["crates/a"]\n[workspace.package]\nedition = "2021"\n');
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'crates/a/src/api/client.rs', 'rust', false, table)).toBeUndefined();
    put('Cargo.toml', '[workspace]\nmembers = ["crates/a"]\n');
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'crates/a/src/api/client.rs', 'rust', false, table)).toBeUndefined();
    // A package at the repository root, with no ancestor to look in.
    put('Cargo.toml', '[package]\nname = "a"\nedition.workspace = true\n');
    put('src/lib.rs', 'mod shapes;\n');
    put('src/shapes.rs', '');
    put('src/api/client.rs', '');
    table = await tableNow();
    expect(makeResolvePathToFile(ws)('shapes::Circle', 'src/api/client.rs', 'rust', false, table)).toBeUndefined();
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

  it('binds a crate:: root item to the root that a chain of plain mod declarations leads to, to none when the chains lead to several, and in the usual order when none is known', async () => {
    put('Cargo.toml', '[package]\nname = "app"\nedition = "2021"\n[[bin]]\nname = "cli"\npath = "src/cli.rs"\n');
    put('src/lib.rs', '// mod comment;\npub mod lib_only;\npub mod nested_in_lib {\n    pub mod inside;\n}\nmod both;\nmod r#raw;\npub const TEXT: &str = "mod in_string { mod x; }";\npub struct Opts;\npub struct LibOpts;\n#[cfg(feature = "x")]\nmod cfg_in_lib;\n#[cfg(unix)]\nmod cfg_both;\nmod gated;\n');
    put('src/main.rs', 'mod main_only;\nmod both;\nstruct Opts;\nstruct MainOpts;\nfn main() {}\nmod cfg_in_lib;\n#[cfg(windows)]\nmod cfg_both;\n#[cfg(feature = "cli")]\nmod cfg_main;\n#[cfg(unix)]\nmod gated;\n');
    for (const f of ['cfg_in_lib', 'cfg_both', 'cfg_main']) put(`src/${f}/mod.rs`, '');
    put('src/gated/mod.rs', 'mod inner;\n');
    put('src/gated/inner.rs', '');
    put('src/cli.rs', 'mod cli_only;\nmod both;\nmod inside;\nstruct Opts;\nstruct CliOpts;\nfn main() {}\n');
    for (const f of ['lib_only', 'cli_only', 'both', 'orphan', 'raw', 'in_string']) put(`src/${f}/mod.rs`, '');
    put('src/main_only/mod.rs', 'mod deep;\nmod inline {\n    mod leaf;\n}\n');
    put('src/main_only/deep.rs', 'mod deeper;\n');
    put('src/main_only/deep/deeper.rs', '');
    put('src/main_only/inline/leaf.rs', '');
    put('src/main_only/loose.rs', '');
    put('src/nested_in_lib/inside.rs', '');
    put('src/inside.rs', '');
    put('src/cli/args.rs', '');
    put('tools/stray.rs', '');
    put('m/Cargo.toml', '[package]\nname = "m"\nedition = "2021"\n');
    put('m/src/lib.rs', 'mod other;\n');
    put('m/src/main.rs', 'fn main() {}\n');
    put('m/src/mod.rs', '');
    put('m/src/other.rs', '');
    put('src/lib_only/twice.rs', 'mod leaf;\n');
    put('src/lib_only/twice/leaf.rs', '');
    put('src/lib_only/mod.rs', 'mod twice;\nmod twice {\n    mod leaf;\n}\n');
    const table = await tableNow();
    const resolve = (spec, from) => makeResolvePathToFile(ws)(spec, from, 'rust', false, table);
    expect(resolve('crate::Opts', 'src/lib_only/mod.rs')).toBe('src/lib.rs');
    expect(resolve('crate::Opts', 'src/main_only/mod.rs')).toBe('src/main.rs');
    expect(resolve('crate::Opts', 'src/cli_only/mod.rs')).toBe('src/cli.rs');
    // The chain is followed through every module file down to the asking file, and through inline modules.
    expect(resolve('crate::Opts', 'src/main_only/deep.rs')).toBe('src/main.rs');
    expect(resolve('crate::Opts', 'src/main_only/deep/deeper.rs')).toBe('src/main.rs');
    expect(resolve('crate::Opts', 'src/main_only/inline/leaf.rs')).toBe('src/main.rs');
    expect(resolve('crate::Opts', 'src/nested_in_lib/inside.rs')).toBe('src/lib.rs');
    expect(resolve('crate::Opts', 'src/inside.rs')).toBe('src/cli.rs');
    expect(resolve('crate::Opts', 'src/raw/mod.rs')).toBe('src/lib.rs');
    // The root itself, and a climb to it, are the known root's.
    expect(resolve('crate', 'src/main_only/mod.rs')).toBe('src/main.rs');
    expect(resolve('super::Opts', 'src/main_only/mod.rs')).toBe('src/main.rs');
    expect(resolve('super::super::Opts', 'src/main_only/deep.rs')).toBe('src/main.rs');
    // A name the known root does not hold is looked for in the other roots, in their usual order: one of them may compile the file too.
    expect(resolve('crate::MainOpts', 'src/main_only/mod.rs')).toBe('src/main.rs');
    expect(resolve('crate::MainOpts', 'src/lib_only/mod.rs')).toBe('src/main.rs');
    expect(resolve('crate::LibOpts', 'src/main_only/mod.rs')).toBe('src/lib.rs');
    expect(resolve('crate::CliOpts', 'src/main_only/mod.rs')).toBe('src/cli.rs');
    expect(resolve('crate::Nowhere', 'src/main_only/mod.rs')).toBeUndefined();
    // A module that two or more roots certainly compile binds no root item; its module paths still resolve.
    expect(resolve('crate::Opts', 'src/both/mod.rs')).toBeUndefined();
    expect(resolve('crate::LibOpts', 'src/both/mod.rs')).toBeUndefined();
    expect(resolve('crate', 'src/both/mod.rs')).toBeUndefined();
    expect(resolve('crate::lib_only', 'src/both/mod.rs')).toBe('src/lib_only/mod.rs');
    // A declaration under a cfg may be removed, so it never makes the second of two crates: the root that certainly compiles the file is tried first, the one that may compile it after it.
    expect(resolve('crate::Opts', 'src/cfg_in_lib/mod.rs')).toBe('src/main.rs');
    expect(resolve('crate::LibOpts', 'src/cfg_in_lib/mod.rs')).toBe('src/lib.rs');
    expect(resolve('crate', 'src/cfg_in_lib/mod.rs')).toBe('src/main.rs');
    // The cfg may stand on any declaration of the chain.
    expect(resolve('crate::Opts', 'src/gated/inner.rs')).toBe('src/lib.rs');
    expect(resolve('crate::MainOpts', 'src/gated/inner.rs')).toBe('src/main.rs');
    // Roots that all declare the file under a cfg keep their usual order, and stand before a root that does not declare it.
    expect(resolve('crate::Opts', 'src/cfg_both/mod.rs')).toBe('src/lib.rs');
    expect(resolve('crate::MainOpts', 'src/cfg_both/mod.rs')).toBe('src/main.rs');
    expect(resolve('crate::Opts', 'src/cfg_main/mod.rs')).toBe('src/main.rs');
    expect(resolve('crate::LibOpts', 'src/cfg_main/mod.rs')).toBe('src/lib.rs');
    // No chain reaches these files, or the chain has a gap: nothing is known, and the roots are tried in their usual order, the library first. A file may be compiled through a path attribute, an included file or a macro.
    expect(resolve('crate::Opts', 'src/orphan/mod.rs')).toBe('src/lib.rs');
    expect(resolve('crate::MainOpts', 'src/orphan/mod.rs')).toBe('src/main.rs');
    expect(resolve('crate', 'src/orphan/mod.rs')).toBe('src/lib.rs');
    expect(resolve('crate::Opts', 'src/in_string/mod.rs')).toBe('src/lib.rs');
    expect(resolve('crate::Opts', 'src/main_only/loose.rs')).toBe('src/lib.rs');
    expect(resolve('crate::Opts', 'tools/stray.rs')).toBe('src/lib.rs');
    // A mod.rs beside the roots is no module of the tree by its name: nothing is known about it, and its module paths resolve.
    expect(resolve('crate::other', 'm/src/mod.rs')).toBe('m/src/other.rs');
    // A file that two declarations of one parent reach is still one module of one root.
    expect(resolve('crate::MainOpts', 'src/lib_only/twice/leaf.rs')).toBe('src/main.rs');
    expect(resolve('crate::Opts', 'src/lib_only/twice/leaf.rs')).toBe('src/lib.rs');
    // src/cli.rs is a root. As a root its `mod inside;` is src/inside.rs; src/cli/args.rs would be a module of a module called cli, which no root declares.
    expect(resolve('crate::Opts', 'src/cli/args.rs')).toBe('src/lib.rs');
    // A root file is its own crate's root.
    expect(resolve('crate::Opts', 'src/cli.rs')).toBe('src/cli.rs');
    // Without the pass's symbol table no declaration is known, so every module takes the usual order.
    const bare = makeResolvePathToFile(ws);
    expect(bare('crate::Opts', 'src/main_only/mod.rs', 'rust')).toBe('src/lib.rs');
    expect(bare('crate::Opts', 'src/both/mod.rs', 'rust')).toBe('src/lib.rs');
    expect(bare('crate::MainOpts', 'src/main_only/mod.rs', 'rust')).toBe('src/main.rs');
  });

  it('reads the edition of a module of the library as before when a [[bin]] in src/ has an edition of its own', async () => {
    // Edition 2015 by default: `use shapes::Circle;` in a module of the library is relative to the crate root. A binary declared in src/ with another edition is one more root of the tree, and it does not change how the library's modules read.
    put('Cargo.toml', '[package]\nname = "app"\n[[bin]]\nname = "cli"\npath = "src/cli.rs"\nedition = "2021"\n');
    put('src/lib.rs', 'mod shapes;\nmod api;\n');
    put('src/cli.rs', 'mod args;\nfn main() {}\n');
    put('src/shapes.rs', '');
    put('src/args.rs', '');
    put('src/api/mod.rs', 'mod client;\n');
    put('src/api/client.rs', '');
    put('src/loose.rs', '');
    const table = await tableNow();
    const resolve = (spec, from) => makeResolvePathToFile(ws)(spec, from, 'rust', false, table);
    expect(resolve('shapes::Circle', 'src/api/client.rs')).toBe('src/shapes.rs');
    expect(resolve('shapes::Circle', 'src/loose.rs')).toBe('src/shapes.rs');
    expect(resolve('shapes::Circle', 'src/lib.rs')).toBe('src/shapes.rs');
    // The binary's own root reads its own edition.
    expect(resolve('shapes::Circle', 'src/cli.rs')).toBeUndefined();
    // A module of the 2021 binary keeps the edge the library's edition gave it before: the library may compile it too. A name only the binary's root declares is no module of an edition 2015 root, so it gives none.
    expect(resolve('shapes::Circle', 'src/args.rs')).toBe('src/shapes.rs');
    expect(resolve('args::Parsed', 'src/api/client.rs')).toBeUndefined();
    expect(resolve('args::Parsed', 'src/args.rs')).toBeUndefined();
    // The mirror: a 2021 package whose binary in src/ is edition 2015. Its module reads a bare path from the binary's root, and the library's modules do not.
    put('Cargo.toml', '[package]\nname = "app"\nedition = "2021"\n[[bin]]\nname = "cli"\npath = "src/cli.rs"\nedition = "2015"\n');
    put('src/cli.rs', 'mod args;\nmod flags;\nfn main() {}\n');
    put('src/flags.rs', '');
    const mirror = await tableNow();
    const resolveMirror = (spec, from) => makeResolvePathToFile(ws)(spec, from, 'rust', false, mirror);
    expect(resolveMirror('flags::Flag', 'src/args.rs')).toBe('src/flags.rs');
    expect(resolveMirror('flags::Flag', 'src/api/client.rs')).toBeUndefined();
    expect(resolveMirror('shapes::Circle', 'src/api/client.rs')).toBeUndefined();
    // Without the table no root is known to compile a file, and a binary declared in src/ decides no edition.
    expect(makeResolvePathToFile(ws)('flags::Flag', 'src/args.rs', 'rust')).toBeUndefined();
  });

  it('takes a root for certain only from a plain mod item of the parse tree, and keeps the usual order for every other way a module can be written', async () => {
    const lib = 'src/lib.rs';
    const main = 'src/main.rs';
    // [main.rs text, the module file below src/, the file `crate::Opts` binds there]. The library and the binary each hold an `Opts`. The binary is bound only where its text declares the module file by name alone; anything else leaves the usual order, where the library comes first.
    const inBinary = [
      ['mod a;\n', 'a/mod.rs', main],
      ['mod a;\n', 'a.rs', main],
      ['pub(crate) mod a;\n', 'a.rs', main],
      ['mod r#a;\n', 'a.rs', main],
      ['#[cfg(unix)]\nmod a;\n', 'a.rs', main],
      ['/// Doc.\n#[allow(dead_code)]\n// a comment between\n#[rustfmt::skip]\n#[macro_use]\nmod a;\n', 'a.rs', main],
      ['#![no_std]\n#![cfg_attr(docsrs, feature(doc_cfg))]\n#![allow(dead_code)]\nmod a;\n', 'a.rs', main],
      ["const Q: char = '\"'; const B: char = '{';\nmod a;\n", 'a.rs', main],
      ['const R: &str = r##"a "# { "##;\nconst B: &[u8] = br#"{ "#;\nmod a;\n', 'a.rs', main],
      ['/* mod b; /* nested */ mod c; */\nmod a;\n', 'a.rs', main],
      ['/* mod b; /* nested */ mod c; */\nmod a;\n', 'b.rs', lib],
      ['pub const TEXT: &str = "mod a;";\n', 'a.rs', lib],
      ['thread_local! { static X: u8 = 1; }\ninclude!("more.rs");\nmod a;\n', 'a.rs', main],
      // An inline module puts the file below its name; a module of that name beside the root is another file.
      ['mod outer {\n    mod a;\n}\n', 'outer/a.rs', main],
      ['mod outer {\n    mod a;\n}\n', 'a.rs', lib],
      ['mod outer {\n    pub mod inner {\n        mod a;\n    }\n}\n', 'outer/inner/a/mod.rs', main],
      // A `mod` in a function body, or written by a macro's tokens, is no item of the tree.
      ['fn f() {\n    mod a;\n}\n', 'a.rs', lib],
      ['cfg_if! {\n    if #[cfg(unix)] {\n        mod a;\n    } else {\n        mod b;\n    }\n}\n', 'a.rs', lib],
      ['cfg_if::cfg_if! { if #[cfg(unix)] { mod a; } }\n', 'a.rs', lib],
      ['macro_rules! decl { ($n:ident) => { mod $n; }; }\ndecl!(a);\n', 'a.rs', lib],
      ['macro decl($n:ident) { mod $n; }\ndecl!(a);\n', 'a.rs', lib],
      ['#[macro_use]\nmod macros;\ndecl_mods!(a);\n', 'a.rs', lib],
      ['::kit::decl_mods!(a);\n', 'a.rs', lib],
      ['r#decl!(a);\n', 'a.rs', lib],
      ['include!("mods.rs");\n', 'a.rs', lib],
      ['::core::include!("mods.rs");\n', 'a.rs', lib],
      // An attribute that can move or rewrite the module leaves it unknown: a path, a cfg_attr, an attribute macro, on the `mod` or on an inline module around it.
      ['#[path = "x.rs"]\nmod a;\n', 'a.rs', lib],
      ['#[path = "x.rs"]\nmod a;\n', 'x.rs', lib],
      ['#[cfg_attr(unix, path = "x.rs")]\nmod a;\n', 'a.rs', lib],
      ['#[cfg_attr(docsrs, doc(cfg(unix)))]\nmod a;\n', 'a.rs', lib],
      ['#[kit::modules]\nmod a;\n', 'a.rs', lib],
      ['#[instrument]\nmod a;\n', 'a.rs', lib],
      ['#[path = "elsewhere"]\nmod outer {\n    mod a;\n}\n', 'outer/a.rs', lib],
      ['mod outer {\n    #![path = "elsewhere"]\n    mod a;\n}\n', 'outer/a.rs', lib],
      ['#![cfg_attr(unix, path = "x")]\nmod a;\n', 'a.rs', lib],
      ['#![kit::rewrite]\nmod a;\n', 'a.rs', lib],
      // A file that does not parse to the end tells nothing, not even a `mod` that stands before the damage.
      ['fn broken( {\n}\nmod a;\n', 'a.rs', lib],
      ['mod a;\nfn f() {\n', 'a.rs', lib],
      ['mod a;\n}\n', 'a.rs', lib],
      ['mod a;\nconst S: &str = "open', 'a.rs', lib],
      ['mod a\n', 'a.rs', lib],
    ];
    // [lib.rs text, the module below src/, the file bound, main.rs text]: every shape an earlier reading of the library's text met. The library holds the name, so each binds the library, known or not; only a plain declaration in the binary changes that.
    const inLibrary = [
      ['mod a;\n', 'a', lib],
      ['/* mod a; /* nested */ mod b; */\nmod c;\n', 'a', lib],
      ['/* mod a; /* nested */ mod b; */\nmod c;\n', 'c', lib],
      ["const Q: char = '\"'; const B: char = '{';\nmod a;\n", 'a', lib],
      ["const E: char = '\\'';\nconst U: char = '\\u{7b}';\nconst W: char = '\\\\';\nmod a;\n", 'a', lib],
      ["const S: char = '😀';\nfn f<'a>(x: &'a str) -> &'a str { x }\nmod a;\n", 'a', lib],
      ['const R: &str = r##"a "# { "##;\nconst B: &[u8] = br#"{ "#;\nconst X: &[u8] = b"{\\"";\nmod a;\n', 'a', lib],
      ['const R: &str = "a // not a comment /* {";\nmod a;\n', 'a', lib],
      ['const R: &str = "a \\" { b";\nmod a;\n', 'a', lib],
      ['mod r#a;\n', 'a', lib],
      ['mod outer {\n    mod a;\n}\n', 'a', lib],
      ['fn f() {\n    mod a;\n}\n', 'a', lib],
      ['cfg_if! {\n    if #[cfg(unix)] {\n        mod a;\n    } else {\n        mod b;\n    }\n}\n', 'b', lib],
      ['cfg_if! { if #[cfg(unix)] { mod outer { mod a; } } }\n', 'a', lib],
      ['thread_local! { static X: u8 = 1; }\nmod a;\n', 'a', lib],
      ['#[path = "x.rs"]\nmod a;\n', 'b', lib],
      ['#![cfg_attr(unix, path = "x.rs")]\nmod a;\n', 'b', lib],
      ['macro_rules! decl { ($n:ident) => { mod $n; }; }\ndecl!(b);\n', 'b', lib],
      ['macro_rules! decl { ($n:ident) => { mod a; mod $n; }; }\n', 'a', lib],
      ['macro_rules! plain { () => { 1 }; }\nconst X: u8 = plain!();\nmod a;\n', 'b', lib],
      ['thread_local! { static X: u8 = 1; }\nmod a;\n', 'b', lib],
      ['mod a;\n#[macro_export]\nlazy_static::lazy_static! { static ref X: u8 = 1; }\n', 'b', lib],
      ['#[macro_use]\nmod macros;\ndecl_mods!(b);\n', 'b', lib],
      ['include!("mods.rs");\n', 'b', lib],
      ['macro decl($n:ident) { mod $n; }\ndecl!(b);\n', 'b', lib],
      ['cfg_if! { if #[cfg(unix)] { mod a; other_macro!(b); } }\n', 'b', lib],
      ['fn broken( {\n}\nmod a;\n', 'b', lib],
      ['mod a;\nfn f( { ) }\n', 'b', lib],
      ['mod a;\n}\n', 'b', lib],
      ['mod a;\nfn f() {\n', 'b', lib],
      ['const S: &str = concat!("a", "b");\nstatic V: u8 = size!();\nmod a;\n', 'b', lib],
      ['fn f() { println!("{}", 1); }\nimpl T { const N: u8 = n!(); }\nmod a;\n', 'b', lib],
      ['cfg_if::cfg_if! { if #[cfg(unix)] { mod a; } }\n', 'b', lib],
      ['#[cfg(unix)]\nmod a;\n#[derive(Debug)] struct S;\n', 'b', lib],
      ['#!/usr/bin/env run-script {\nconst X: u8 = 1;\nmod a;\n', 'a', lib],
      ['#![allow(dead_code)]\nmod a;\n', 'a', lib],
      ['const C: &core::ffi::CStr = cr#"say " {"#;\nconst D: &core::ffi::CStr = c"{";\nmod a;\n', 'a', lib],
      // A string, a character or a comment left open swallows the rest of the library's text, its `struct Opts` with it: the library's tree binds no such item, and the binary, the next root in the usual order, does.
      ['mod a;\nconst S: &str = "open', 'a', main],
      ['mod a;\nconst S: &str = r#"open', 'a', main],
      ["mod a;\nconst C: char = '\\", 'a', main],
      ['mod a;\n/* open', 'a', main],
      // The binary declares the module by name alone, so the binary certainly compiles it, whatever the library's text holds.
      ['#[path = "imp/thing.rs"]\nmod thing;\n', 'imp', main, 'mod imp;\n'],
      ['macro_rules! m { () => {}; }\n', 'b', main, 'mod b;\n'],
      ['mod a;\n', 'b', main, 'include!("x.rs");\nmod b;\n'],
      ['mod a;\n', 'b', main, 'mod b;\n'],
      ['mod a;\n', 'a', lib, 'mod b;\n'],
      // Both declare it by name alone: two crates, no root item.
      ['mod a;\n', 'a', undefined, 'mod a;\n'],
      // A declaration under a cfg is not the second crate: the root that declares the module for certain binds it, whichever root holds the cfg and wherever the cfg stands.
      ['mod a;\n', 'a', lib, '#[cfg(any())]\nmod a;\n'],
      ['#[cfg(any())]\nmod a;\n', 'a', main, 'mod a;\n'],
      ['#[cfg(feature = "never")]\nmod a;\n', 'a', main, 'mod a;\n'],
      ['#![cfg(feature = "f")]\nmod a;\n', 'a', main, 'mod a;\n'],
      ['#![cfg_attr(docsrs, cfg(docsrs))]\nmod a;\n', 'a', main, 'mod a;\n'],
      ['#[cfg(unix)]\nmod a;\n', 'a', lib, '#[cfg(windows)]\nmod a;\n'],
      // An inner cfg_attr that applies no cfg leaves the declaration certain: two crates again.
      ['#![cfg_attr(docsrs, feature(doc_cfg))]\nmod a;\n', 'a', undefined, 'mod a;\n'],
    ];
    inBinary.forEach(([mainText, file], n) => {
      put(`b${n}/Cargo.toml`, '[package]\nname = "app"\nedition = "2021"\n');
      put(`b${n}/src/lib.rs`, 'pub struct Opts;\n');
      put(`b${n}/src/main.rs`, `${mainText}\nstruct Opts;\nfn main() {}\n`);
      put(`b${n}/src/${file}`, '');
    });
    inLibrary.forEach(([libText, mod, , mainText = ''], n) => {
      put(`s${n}/Cargo.toml`, '[package]\nname = "app"\nedition = "2021"\n');
      put(`s${n}/src/lib.rs`, `${libText}\npub struct Opts;\n`);
      put(`s${n}/src/main.rs`, `${mainText}struct Opts;\nfn main() {}\n`);
      put(`s${n}/src/${mod}/mod.rs`, '');
    });
    const table = await tableNow();
    const resolve = makeResolvePathToFile(ws);
    inBinary.forEach(([mainText, file, expected], n) => {
      expect(resolve('crate::Opts', `b${n}/src/${file}`, 'rust', false, table), `main.rs ${JSON.stringify(mainText)} → ${file}`).toBe(`b${n}/${expected}`);
    });
    inLibrary.forEach(([libText, mod, expected], n) => {
      expect(resolve('crate::Opts', `s${n}/src/${mod}/mod.rs`, 'rust', false, table), `lib.rs ${JSON.stringify(libText)} → ${mod}`).toBe(expected === undefined ? undefined : `s${n}/${expected}`);
    });
  });

  it('reads the files of a src/bin/ directory without main.rs as modules of the binary that declares them, and of no crate when none or several do', async () => {
    put('Cargo.toml', '[package]\nname = "app"\nedition = "2021"\n');
    put('src/lib.rs', 'pub struct LibThing;\n');
    put('src/bin/one.rs', 'mod common;\nmod config;\nmod mixed;\nstruct Top;\nfn main() {}\n');
    put('src/bin/two.rs', 'mod shared;\nmod config;\n#[cfg(feature = "x")]\nmod mixed;\nstruct Two;\nfn main() {}\n');
    put('src/bin/three.rs', 'mod shared;\nfn main() {}\n');
    put('src/bin/config/mod.rs', 'pub struct Cfg;\n');
    put('src/bin/common/mod.rs', 'mod deep;\n');
    put('src/bin/common/deep/mod.rs', '');
    put('src/bin/shared/mod.rs', 'mod sib;\nmod other;\n');
    put('src/bin/loose/mod.rs', 'mod sub;\nmod peer;\n');
    put('src/bin/loose/sub.rs', '');
    put('src/bin/loose/peer.rs', '');
    put('src/bin/shared/sib.rs', '');
    put('src/bin/shared/other.rs', '');
    put('src/bin/withmain/main.rs', 'mod config;\nfn main() {}\n');
    put('src/bin/withmain/config/mod.rs', '');
    put('src/bin/withmain/helper.rs', '');
    put('src/bin/selfish.rs', 'mod selfish;\nmod inner;\nfn main() {}\n');
    put('src/bin/selfish/inner.rs', '');
    put('src/bin/four.rs', '#[cfg(unix)]\nmod gated;\nstruct Four;\nfn main() {}\n');
    put('src/bin/gated/mod.rs', '');
    put('src/bin/five.rs', '#[cfg(windows)]\nmod gated;\nstruct Five;\nfn main() {}\n');
    put('src/bin/mixed/mod.rs', '');
    const declared = await tableNow();
    const resolve = (spec, from, language) => makeResolvePathToFile(ws)(spec, from, language, false, declared);
    // Without the pass's symbol table no binary is known to declare the directory, and it is still no crate of its own.
    expect(makeResolvePathToFile(ws)('crate::config::Cfg', 'src/bin/common/mod.rs', 'rust')).toBeUndefined();
    expect(makeResolvePathToFile(ws)('self::deep', 'src/bin/common/mod.rs', 'rust')).toBe('src/bin/common/deep/mod.rs');
    // The binary that declares the directory roots its files, at any depth, for `crate::` and `super::` alike.
    expect(resolve('crate::config::Cfg', 'src/bin/common/mod.rs', 'rust')).toBe('src/bin/config/mod.rs');
    expect(resolve('super::config::Cfg', 'src/bin/common/mod.rs', 'rust')).toBe('src/bin/config/mod.rs');
    expect(resolve('crate::config::Cfg', 'src/bin/common/deep/mod.rs', 'rust')).toBe('src/bin/config/mod.rs');
    expect(resolve('crate::Top', 'src/bin/common/deep/mod.rs', 'rust')).toBe('src/bin/one.rs');
    // None declares the directory, or two do: which crate it is cannot be told, so `crate::` and `super::` name nothing, while `self::`, the package's own name and the file's own module still do.
    for (const from of ['src/bin/loose/mod.rs', 'src/bin/shared/mod.rs']) {
      expect(resolve('crate::config::Cfg', from, 'rust')).toBeUndefined();
      expect(resolve('super::config::Cfg', from, 'rust')).toBeUndefined();
      expect(resolve('self::super::config::Cfg', from, 'rust')).toBeUndefined();
      expect(resolve('app::LibThing', from, 'rust')).toBe('src/lib.rs');
    }
    expect(resolve('self::sub', 'src/bin/loose/mod.rs', 'rust')).toBe('src/bin/loose/sub.rs');
    // A climb that stays inside the directory is the same in every crate that declares it, so it keeps its edge; one that reaches the tree's root does not.
    expect(resolve('super::other::T', 'src/bin/shared/sib.rs', 'rust')).toBe('src/bin/shared/other.rs');
    expect(resolve('super::peer::T', 'src/bin/loose/sub.rs', 'rust')).toBe('src/bin/loose/peer.rs');
    expect(resolve('super::super::config::Cfg', 'src/bin/shared/sib.rs', 'rust')).toBeUndefined();
    expect(resolve('super::config::Cfg', 'src/bin/shared/mod.rs', 'rust')).toBeUndefined();
    // A declaration under a cfg is a declaration here, never a second certain one: the binaries that hold it are probed as the roots of one tree are, the one that certainly compiles the directory first and those under a cfg after it.
    expect(resolve('crate::Four', 'src/bin/gated/mod.rs', 'rust')).toBe('src/bin/four.rs');
    expect(resolve('crate::Five', 'src/bin/gated/mod.rs', 'rust')).toBe('src/bin/five.rs');
    expect(resolve('crate::Top', 'src/bin/mixed/mod.rs', 'rust')).toBe('src/bin/one.rs');
    expect(resolve('crate::Two', 'src/bin/mixed/mod.rs', 'rust')).toBe('src/bin/two.rs');
    expect(resolve('super::config::Cfg', 'src/bin/mixed/mod.rs', 'rust')).toBe('src/bin/config/mod.rs');
    // A binary that names itself as its own module declares nothing: the files below its name have no known crate.
    expect(resolve('crate::config::Cfg', 'src/bin/selfish/inner.rs', 'rust')).toBeUndefined();
    // A directory with a main.rs is a crate of its own: its files read `crate::` in its tree.
    expect(resolve('crate::config', 'src/bin/withmain/helper.rs', 'rust')).toBe('src/bin/withmain/config/mod.rs');
    expect(resolve('crate::config::Cfg', 'src/bin/withmain/config/mod.rs', 'rust')).toBe('src/bin/withmain/config/mod.rs');
    // In edition 2015 the same files read a bare `use` path from the root of the binary that declares them, and from no root otherwise.
    put('Cargo.toml', '[package]\nname = "app"\n');
    const table = await tableNow();
    const resolve2015 = makeResolvePathToFile(ws);
    expect(resolve2015('config::Cfg', 'src/bin/common/mod.rs', 'rust', false, table)).toBe('src/bin/config/mod.rs');
    expect(resolve2015('config::Cfg', 'src/bin/loose/mod.rs', 'rust', false, table)).toBeUndefined();
  });

  it('roots the build script at the file [package] build names, at build.rs by default, and nowhere with build = false', () => {
    put('src/lib.rs', 'mod util;\n');
    put('src/util/mod.rs', '');
    put('build.rs', 'mod gen;\nfn main() {}\n');
    put('gen.rs', '');
    put('tools/build.rs', 'mod util;\nfn main() {}\n');
    put('tools/util.rs', '');
    put('tools/deep/mod.rs', '');
    put('tools/deep/x.rs', '');
    const resolveWith = (build, spec, from) => {
      put('Cargo.toml', `[package]\nname = "kit"\nedition = "2021"\n${build}`);
      return makeResolvePathToFile(ws)(spec, from, 'rust');
    };
    // No `build` key, or `build = true`: build.rs at the package root, whose modules lie beside it. The files of the package root below it stay out of its tree.
    expect(resolveWith('', 'self::gen', 'build.rs')).toBe('gen.rs');
    expect(resolveWith('build = true\n', 'self::gen', 'build.rs')).toBe('gen.rs');
    expect(resolveWith('build = "build.rs"\n', 'crate::gen', 'build.rs')).toBe('gen.rs');
    expect(resolveWith('', 'crate::util', 'tools/deep/x.rs')).toBe('src/util/mod.rs');
    // A named script roots its own crate: the files beside it and below it read `crate::` in its directory, never in the library's.
    expect(resolveWith('build = "tools/build.rs"\n', 'self::util', 'tools/build.rs')).toBe('tools/util.rs');
    expect(resolveWith('build = "tools/build.rs"\n', 'crate::util', 'tools/build.rs')).toBe('tools/util.rs');
    expect(resolveWith('build = "tools/build.rs"\n', 'crate::util', 'tools/deep/x.rs')).toBe('tools/util.rs');
    expect(resolveWith('build = "./tools/../tools/build.rs"\n', 'crate::util', 'tools/build.rs')).toBe('tools/util.rs');
    expect(resolveWith('build = { }\n', 'self::gen', 'build.rs')).toBe('gen.rs');
    // Then build.rs at the package root is no script, and no root of any crate.
    expect(resolveWith('build = "tools/build.rs"\n', 'self::gen', 'build.rs')).toBe('build.rs');
    expect(resolveWith('build = false\n', 'self::gen', 'build.rs')).toBe('build.rs');
    expect(resolveWith('build = false\n', 'crate::gen', 'build.rs')).toBeUndefined();
    // A path out of the package names no script.
    expect(resolveWith('build = "../tools/build.rs"\n', 'crate::util', 'tools/build.rs')).toBe('src/util/mod.rs');
    // `package` written as an inline table says the same.
    put('Cargo.toml', 'package = { name = "kit", edition = "2021", build = "tools/build.rs" }\n');
    expect(makeResolvePathToFile(ws)('crate::util', 'tools/build.rs', 'rust')).toBe('tools/util.rs');
    expect(parseCargoManifest('[package]\nbuild = "x.rs"\n').build).toBe('x.rs');
    expect(parseCargoManifest('[package]\nbuild = false\n').build).toBe(false);
    expect(parseCargoManifest('[package]\nbuild = true\n').build).toBeUndefined();
  });

  it('roots a bench named bench at src/bench.rs in edition 2015 when benches/bench.rs and benches/bench/main.rs are not exactly one file', () => {
    put('src/lib.rs', 'pub mod bench;\n');
    put('src/bench.rs', 'mod helpers;\n');
    put('src/helpers/mod.rs', '');
    put('src/bench/helpers.rs', '');
    const resolveWith = (manifest, spec, from) => {
      put('Cargo.toml', manifest);
      return makeResolvePathToFile(ws)(spec, from, 'rust');
    };
    const bench = (edition, name = 'bench') => `[package]\nname = "kit"\n${edition === undefined ? '' : `edition = "${edition}"\n`}[[bench]]\nname = "${name}"\n`;
    // No benches/bench.rs: src/bench.rs is the bench's root, so `mod helpers;` is beside it and the library's `mod bench;` has not that file.
    expect(resolveWith(bench(undefined), 'self::helpers', 'src/bench.rs')).toBe('src/helpers/mod.rs');
    expect(resolveWith(bench('2015'), 'self::helpers', 'src/bench.rs')).toBe('src/helpers/mod.rs');
    // From edition 2018, or for any other name, it stays a module of the library.
    expect(resolveWith(bench('2018'), 'self::helpers', 'src/bench.rs')).toBe('src/bench/helpers.rs');
    expect(resolveWith(bench(undefined, 'speed'), 'self::helpers', 'src/bench.rs')).toBe('src/bench/helpers.rs');
    // One file under benches/ is where Cargo finds it; two files make the legacy path apply again.
    put('benches/bench.rs', '');
    expect(resolveWith(bench(undefined), 'self::helpers', 'src/bench.rs')).toBe('src/bench/helpers.rs');
    put('benches/bench/main.rs', '');
    expect(resolveWith(bench(undefined), 'self::helpers', 'src/bench.rs')).toBe('src/helpers/mod.rs');
    // A bench that gives a path of its own is rooted there.
    expect(resolveWith(`${bench(undefined)}path = "benches/bench.rs"\n`, 'self::helpers', 'src/bench.rs')).toBe('src/bench/helpers.rs');
  });

  it('replaces a registry or git dependency by the path of a [patch] entry of the workspace root, in every spelling of the entry', () => {
    const kit = (dir) => {
      put(`${dir}/Cargo.toml`, '[package]\nname = "kit"\nedition = "2021"\n');
      put(`${dir}/src/lib.rs`, 'pub struct Engine;\n');
    };
    for (const dir of ['v/a', 'v/b', 'v/c', 'v/d']) kit(dir);
    put('app/src/lib.rs', '');
    const resolve = (root, dep, spec = 'kit::Engine') => {
      put('Cargo.toml', `${root}[package]\nname = "app"\nedition = "2021"\n[dependencies]\n${dep}\n`);
      put('src/lib.rs', '');
      return makeResolvePathToFile(ws)(spec, 'src/lib.rs', 'rust');
    };
    // The table, dotted-key, sub-table and inline spellings of the entry, and of the whole [patch] table.
    expect(resolve('[patch.crates-io]\nkit = { path = "v/a" }\n', 'kit = "1"')).toBe('v/a/src/lib.rs');
    expect(resolve('[patch.crates-io]\nkit.path = "v/a"\n', 'kit = "1"')).toBe('v/a/src/lib.rs');
    expect(resolve('[patch.crates-io.kit]\npath = "v/a"\n', 'kit = "1"')).toBe('v/a/src/lib.rs');
    expect(resolve('patch = { crates-io = { kit = { path = "v/a" } } }\n', 'kit = "1"')).toBe('v/a/src/lib.rs');
    expect(resolve('patch.crates-io.kit.path = "v/a"\n', 'kit = "1"')).toBe('v/a/src/lib.rs');
    // The default registry by the URL of its index, a git repository by its URL however it ends, an alternative registry by its name.
    expect(resolve('[patch."https://github.com/rust-lang/crates.io-index"]\nkit = { path = "v/a" }\n', 'kit = "1"')).toBe('v/a/src/lib.rs');
    expect(resolve('[patch."sparse+https://index.crates.io/"]\nkit = { path = "v/a" }\n', 'kit = "1"')).toBe('v/a/src/lib.rs');
    expect(resolve('[patch."https://example.com/kit"]\nkit = { path = "v/b" }\n', 'kit = { git = "https://example.com/kit.git/" }')).toBe('v/b/src/lib.rs');
    expect(resolve('[patch.corp]\nkit = { path = "v/c" }\n', 'kit = { version = "1", registry = "corp" }')).toBe('v/c/src/lib.rs');
    // A source that does not match, or cannot be read, is not replaced; nor is a dependency of another package name, or an inherited one nothing declares.
    expect(resolve('[patch.corp]\nkit = { path = "v/c" }\n', 'kit = "1"')).toBeUndefined();
    expect(resolve('[patch.crates-io]\nkit = { path = "v/a" }\n', 'kit = { version = "1", registry = "corp" }')).toBeUndefined();
    expect(resolve('[patch.crates-io]\nkit = { path = "v/a" }\n', 'kit = { git = 1 }')).toBeUndefined();
    expect(resolve('[patch.crates-io]\nkit = { path = "v/a" }\n', 'kit = { registry = 1 }')).toBeUndefined();
    expect(resolve('[patch.crates-io]\nother = { path = "v/a" }\n', 'kit = "1"')).toBeUndefined();
    expect(resolve('[patch.crates-io]\nkit = { path = "v/a" }\n', 'kit = { workspace = true }')).toBeUndefined();
    // The path stays inside the repository.
    expect(resolve('[patch.crates-io]\nkit = { path = "../v/a" }\n', 'kit = "1"')).toBeUndefined();
    // Only the workspace root's [patch] is read: the root of a workspace that lists the package, not the package's own.
    put('Cargo.toml', '[workspace]\nmembers = ["app"]\n');
    put('app/Cargo.toml', '[package]\nname = "app"\nedition = "2021"\n[dependencies]\nkit = "1"\n[patch.crates-io]\nkit = { path = "../v/a" }\n');
    expect(makeResolvePathToFile(ws)('kit::Engine', 'app/src/lib.rs', 'rust')).toBeUndefined();
    put('Cargo.toml', '[workspace]\nmembers = ["app"]\n[patch.crates-io]\nkit = { path = "v/d" }\n');
    expect(makeResolvePathToFile(ws)('kit::Engine', 'app/src/lib.rs', 'rust')).toBe('v/d/src/lib.rs');
    // A package with a workspace table of its own is its workspace root, whatever lies above it.
    put('app/Cargo.toml', '[package]\nname = "app"\nedition = "2021"\n[dependencies]\nkit = "1"\n[workspace]\n[patch.crates-io]\nkit = { path = "../v/a" }\n');
    expect(makeResolvePathToFile(ws)('kit::Engine', 'app/src/lib.rs', 'rust')).toBe('v/a/src/lib.rs');
    expect(parseCargoManifest('[package]\nname = "app"\n').hasWorkspace).toBe(false);
    expect(parseCargoManifest('[workspace]\n').hasWorkspace).toBe(true);
    expect(parseCargoManifest('workspace.members = []\n').hasWorkspace).toBe(true);
    expect(parseCargoManifest('[workspace.dependencies]\nkit = "1"\n').hasWorkspace).toBe(true);
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

  it('leaves a shared helper under tests/ rootless beside a [[test]] path in tests/ itself in an edition 2018 package, and gives no root to the modules of two test paths sharing a directory', () => {
    // ripgrep's `[[test]] path = "tests/tests.rs"` in an edition 2018 package: test auto-discovery stays on, so other test crates in tests/ may declare tests/common/ too (in edition 2015 the declared [[test]] turns it off).
    put('Cargo.toml', '[package]\nname = "app"\nedition = "2018"\n[[test]]\nname = "integration"\npath = "tests/tests.rs"\n[[test]]\nname = "a"\npath = "suites/a.rs"\n[[test]]\nname = "b"\npath = "suites/b.rs"\n[[bench]]\nname = "c"\npath = "suites/c/main.rs"\n');
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
    { const m = parseCargoManifest('[package]\nname = "p"\nautobins = true\nautobins = true\nautotests = false\n[[bin]]\nname = "a"\n[[bin]]\npath = "b.rs"\n[[test]]\nname = "t"\n'); expect({ d: m.discoveredDirs, u: m.undiscoveredDirs, k: m.declaredDirs }).toEqual({ d: ['src/bin'], u: ['tests'], k: ['src/bin', 'tests'] }); }
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
    // A target's own edition, written as a table, inline in the array or under `[lib]`, is read apart from the package's.
    const targets = (text) => {
      const m = parseCargoManifest(text);
      return { libEdition: m.libEdition, targetEditions: m.targetEditions };
    };
    expect(targets('[package]\nname = "p"\nedition = "2021"\n[lib]\nedition = "2015"\n[[bin]]\nname = "a"\nedition = "2018"\n[[test]]\npath = "t.rs"\nedition = "2015"\n')).toEqual({
      libEdition: '2015',
      targetEditions: [{ kind: 'bin', name: 'a', path: undefined, edition: '2018' }, { kind: 'test', name: undefined, path: 't.rs', edition: '2015' }],
    });
    expect(targets('bin = [{ name = "b", edition = "2015" }, { name = "c", edition.workspace = true }]\nlib = { edition = \'2018\' }\n')).toEqual({ libEdition: '2018', targetEditions: [{ kind: 'bin', name: 'b', path: undefined, edition: '2015' }] });
    expect(targets('[package]\nname = "p"\nedition = "2018"\n')).toEqual({ libEdition: undefined, targetEditions: [] });
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
        ['reqwest', { path: undefined, package: 'zed-reqwest', workspace: false, git: 'https://github.com/zed-industries/reqwest.git' }],
        ['next', { path: 'crates/next', package: undefined, workspace: false }],
      ]),
    );
    expect(dependencies).toEqual(
      new Map([
        ['kit', { path: '../kit', package: undefined, workspace: false, git: 'https://example.com/a[b{c' }],
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
    // Anywhere in the file: the top level is the parse tree's question, not this one's.
    expect(rustFileDeclares('pub mod m { pub struct Error; }', 'Error')).toBe(true);
  });

  it('takes the derive a `proc_macro_derive` function defines as one more item beside the function, and no helper attribute', async () => {
    expect(await itemsOf('#[proc_macro_derive(Builder)]\npub fn builder(input: TokenStream) -> TokenStream { input }')).toEqual(['builder', 'Builder']);
    expect(await itemsOf('/// Doc.\n#[proc_macro_derive(r#Builder, attributes(setter, skip))]\n#[allow(dead_code)]\npub fn derive_builder(input: TokenStream) -> TokenStream { input }')).toEqual(['derive_builder', 'Builder']);
    // The other kinds of procedural macro are named by their function.
    expect(await itemsOf('#[proc_macro]\npub fn make(input: TokenStream) -> TokenStream { input }\n#[proc_macro_attribute]\npub fn route(a: TokenStream, b: TokenStream) -> TokenStream { b }')).toEqual(['make', 'route']);
    // An attribute with no name to read adds nothing; one on another kind of item is not read.
    expect(await itemsOf('#[proc_macro_derive()]\npub fn a(input: TokenStream) -> TokenStream { input }\n#[proc_macro_derive]\npub fn b(input: TokenStream) -> TokenStream { input }\n#[proc_macro_derive("C")]\npub fn c(input: TokenStream) -> TokenStream { input }')).toEqual(['a', 'b', 'c']);
    expect(await itemsOf('#[proc_macro_derive(Builder)]\nstruct S;\n#[some::proc_macro_derive(X)]\nfn plain() {}')).toEqual(['S', 'plain']);
  });

  it('reads the names the top level binds with `extern crate` from the parse tree: the alias when renamed, else the crate, with the crate each stands for, and none below the top level', async () => {
    const externsOf = (code) => withParsedFile('x.rs', code, (tree) => topLevelExternCrates(tree.rootNode).map((x) => [x.name, x.crate]));
    expect(await externsOf('pub extern crate grep_printer as printer;\n#[macro_use]\nextern crate log;\nextern crate r#async as r#await ;\nextern crate self as facade;')).toEqual([['printer', 'grep_printer'], ['log', 'log'], ['await', 'async'], ['facade', undefined]]);
    expect(await externsOf('extern crate a as _;\nmod m { extern crate inner; }\nfn f() { extern crate local; }\nconst S: &str = "extern crate text;";\n// extern crate comment;')).toEqual([]);
    const code = 'struct A;\nextern crate log;\npub extern crate grep_printer as printer;\nextern crate self as me;\n';
    await withParsedFile('src/lib.rs', code, (tree) => {
      const keys = rustExtractor.declarations(parsedFile('src/lib.rs', code, tree, 'rust'));
      expect(keys.filter((d) => d.symbolKey.startsWith('extern:'))).toEqual([
        { symbolKey: rustExternNameKey('log'), line: 2 }, { symbolKey: rustExternBindingKey('log', 'log'), line: 2 },
        { symbolKey: rustExternNameKey('printer'), line: 3 }, { symbolKey: rustExternBindingKey('printer', 'grep_printer'), line: 3 },
        { symbolKey: rustExternNameKey('me'), line: 4 },
      ]);
      expect(keys.some((d) => d.symbolKey === rustTopLevelItemKey('log') || d.symbolKey === rustTopLevelItemKey('printer'))).toBe(false);
    });
  });

  it('declares each module a file places by name alone under its module file key, with the line of the mod item, and under a key of its own when a cfg may remove it', async () => {
    const code = '#![allow(dead_code)]\nmod a;\npub mod outer {\n    mod b;\n    pub(crate) mod inner {\n        #[cfg(test)]\n        mod r#c;\n    }\n    #[path = "moved"]\n    mod moved {\n        mod d;\n    }\n}\n#[path = "e.rs"]\nmod e;\nfn f() {}\nstruct mod_like;\n#[cfg(unix)]\nmod gated {\n    mod g;\n    mod deeper {\n        mod h;\n    }\n}\nmod headed {\n    #![cfg(unix)]\n    mod i;\n}\n';
    await withParsedFile('src/lib.rs', code, (tree) => {
      expect(plainModuleFiles(tree.rootNode)).toEqual([
        { path: 'a', line: 2, conditional: false },
        { path: 'outer/b', line: 4, conditional: false },
        { path: 'outer/inner/c', line: 7, conditional: true },
        { path: 'gated/g', line: 20, conditional: true },
        { path: 'gated/deeper/h', line: 22, conditional: true },
        { path: 'headed/i', line: 27, conditional: true },
      ]);
      const keys = rustExtractor.declarations(parsedFile('src/lib.rs', code, tree, 'rust')).map((d) => d.symbolKey);
      expect(keys.filter((k) => k.startsWith('modfile'))).toEqual(['modfile:a', 'modfile:outer/b', 'modfile?:outer/inner/c', 'modfile?:gated/g', 'modfile?:gated/deeper/h', 'modfile?:headed/i']);
      expect(rustModuleFileKey('outer/b')).toBe('modfile:outer/b');
      expect(rustModuleFileKey('outer/b', true)).toBe('modfile?:outer/b');
    });
    // A cfg at the head of the file, or a cfg_attr there that applies one, makes every declaration of the file conditional; a cfg_attr that applies none does not.
    const flags = (text) => withParsedFile('x.rs', text, (tree) => plainModuleFiles(tree.rootNode).map((m) => m.conditional));
    expect(await flags('#![cfg(feature = "f")]\nmod a;\nmod b;\n')).toEqual([true, true]);
    expect(await flags('#![cfg_attr(docsrs, cfg(docsrs))]\nmod a;\n')).toEqual([true]);
    expect(await flags('#![cfg_attr(docsrs, feature(doc_cfg))]\n#![no_std]\nmod a;\n')).toEqual([false]);
    expect(await flags('#[cfg(any())]\n#[allow(dead_code)]\nmod a;\n#[allow(dead_code)]\nmod b;\n')).toEqual([true, false]);
    // What a cfg_attr applies is read from its tokens: a comment changes nothing, a nested cfg_attr is followed, and a cfg written inside another attribute, or a word in a string, applies nothing.
    expect(await flags('#![cfg_attr(all(), cfg /* c */ (any()))]\nmod a;\n')).toEqual([true]);
    expect(await flags('#![cfg_attr(all(), // c\n    cfg(any()))]\nmod a;\n')).toEqual([true]);
    expect(await flags('#![cfg_attr(unix, allow(dead_code), cfg_attr(docsrs, cfg(docsrs)))]\nmod a;\n')).toEqual([true]);
    expect(await flags('#![cfg_attr(docsrs, doc(cfg(unix)))]\nmod a;\n')).toEqual([false]);
    expect(await flags('#![cfg_attr(docsrs, rustfmt::skip, doc = "cfg(x)")]\nmod a;\n')).toEqual([false]);
    expect(await flags('#![cfg_attr(unix, cfg(x),)]\nmod a;\n')).toEqual([true]);
    // A cfg_attr whose tokens do not read as a predicate and attributes may apply anything, a path included, so the file declares none.
    expect(await flags('#![cfg_attr(unix)]\nmod a;\n')).toEqual([]);
    expect(await flags('#![cfg_attr(unix, = x)]\nmod a;\n')).toEqual([]);
    expect(await flags('#![cfg_attr(unix, cfg_attr)]\nmod a;\n')).toEqual([]);
    expect(await flags('#![cfg_attr(, cfg(x))]\nmod a;\n')).toEqual([]);
    // A file that does not parse to the end declares none, and neither does a nameless or damaged `mod`.
    await withParsedFile('x.rs', 'mod a;\nfn broken( {\n', (tree) => expect(plainModuleFiles(tree.rootNode)).toEqual([]));
    await withParsedFile('x.rs', '', (tree) => expect(plainModuleFiles(tree.rootNode)).toEqual([]));
  });

  // The names the top level of `code` binds as items, as the Rust extractor reads them from the parse tree.
  const itemsOf = (code) => withParsedFile('x.rs', code, (tree) => topLevelItemNames(tree.rootNode).map((x) => x.name));

  it('as an item of the root, takes a name the top level defines or imports, from the parse tree, and never an `extern crate` or a name that only leads a longer path', async () => {
    expect(await itemsOf('pub enum Error {}\nmod shapes;\nmacro_rules! m { () => {} }\npub(crate) union U { a: u8 }\ntype T = u8;\nconst C: u8 = 0;\nstatic S: u8 = 0;\npub const fn cf() {}\ntrait Tr {}')).toEqual(['Error', 'shapes', 'm', 'U', 'T', 'C', 'S', 'cf', 'Tr']);
    expect(await itemsOf('pub use a::{b::Error, c};')).toEqual(['Error', 'c']);
    expect(await itemsOf('use a::b as Error;\nuse h;\nuse x::y as _;\nuse a::Error as Other;')).toEqual(['Error', 'h', 'Other']);
    expect(await itemsOf('use a::{self, f::{self as G}, *};\nuse a::b::*;\nuse {x, y::z};')).toEqual(['a', 'G', 'x', 'z']);
    expect(await itemsOf('use r#gen::r#type;\npub mod r#async;')).toEqual(['type', 'async']);
    expect(await itemsOf('extern crate serde;\nextern crate core as kernel;\nuse serde::Deserialize;')).toEqual(['Deserialize']);
    expect(await itemsOf('const _: () = {};\nimpl S { fn Error() {} }\nunsafe impl Send for S { const Error: u8 = 0; }\npub trait T2 { type Error; }')).toEqual(['T2']);
  });

  it('as an item of the root, reads nothing nested: an inline mod, a function body, an initializer block, a closure, a use in a block, a macro_rules! body', async () => {
    expect(await itemsOf('pub mod m { pub struct Error; }')).toEqual(['m']);
    expect(await itemsOf('fn f() { use a::Error; struct Local; }')).toEqual(['f']);
    expect(await itemsOf('const _: () = { struct Error; };')).toEqual([]);
    expect(await itemsOf('static S: u8 = { struct Error; 0 };')).toEqual(['S']);
    expect(await itemsOf('static L: Lazy<u8> = Lazy::new(|| { struct Error; 0 });')).toEqual(['L']);
    expect(await itemsOf('const _: () = { use a::Error; };')).toEqual([]);
    expect(await itemsOf('macro_rules! m { () => { struct Error; } }')).toEqual(['m']);
    // A brace or a keyword inside a literal or an attribute string is text.
    expect(await itemsOf('fn f() { let s = br#"} " }"#; let c = \'}\'; let d = "}"; struct Error; }\nstruct After;')).toEqual(['f', 'After']);
    expect(await itemsOf('const S: &str = "{ a \\" b";\nstruct Error;')).toEqual(['S', 'Error']);
    expect(await itemsOf('fn f<\'a>(x: &\'a str) { struct Error; }')).toEqual(['f']);
  });

  it('as an item of the root, takes the items of an extern block and of the item macros whose expansion is known, and only at their own level', async () => {
    expect(await itemsOf('#[cfg(feature = "fn")] extern "C" { fn foo(); static BAR: u8; type Opaque; }')).toEqual(['foo', 'BAR', 'Opaque']);
    expect(await itemsOf('thread_local! { static COUNTER: Cell<u8> = Cell::new(0); pub static TL2: Cell<u8> = const { Cell::new(0) }; }\nthread_local!(static TL: u8 = 0);')).toEqual(['COUNTER', 'TL2', 'TL']);
    expect(await itemsOf('lazy_static! { static ref TABLE: u8 = 0; static mut M: u8 = 0; }')).toEqual(['TABLE', 'M']);
    expect(await itemsOf('bitflags! { #[derive(Debug)] pub struct Flags: u32 { const A = 1; } }\nbitflags::bitflags! { struct Other: u8 { const B = 2; } }')).toEqual(['Flags', 'Other']);
    expect(await itemsOf('cfg_if! { if #[cfg(feature = "impl")] { mod imp; pub use self::imp::Exported; } else { mod imp2; use a::{b, c}; use d::*; fn helper() { struct No; } } }')).toEqual(['imp', 'Exported', 'imp2', 'helper']);
    expect(await itemsOf('cfg_if::cfg_if! { if #[cfg(unix)] { cfg_if! { if #[cfg(x)] { pub union U { a: u8 } macro_rules! mm { () => {} } } } } }')).toEqual(['U', 'mm']);
    // Another macro's expansion is not known, so its tokens define nothing; neither does a macro written without a body.
    expect(await itemsOf('other_macro! { struct NotKnown; }\nbitflags!();\nthread_local!;')).toEqual([]);
  });

  it('declares each top-level item under its own key beside the declarations it always made, and the resolver asks only that key', async () => {
    const code = 'pub struct Engine;\npub use a::Error;\nfn f() { struct Local; }';
    const keys = await withParsedFile('src/lib.rs', code, (tree) => rustExtractor.declarations(parsedFile('src/lib.rs', code, tree, 'rust')).map((d) => d.symbolKey));
    expect(keys).toEqual(['Engine', 'f', rustTopLevelItemKey('Engine'), rustTopLevelItemKey('Error'), rustTopLevelItemKey('f'), RUST_MODULES_KNOWN_KEY]);
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

describe('resolveRustPath — a use path that starts with a name in scope (injected deps)', () => {
  const known = new Set(['src/lib.rs', 'src/shapes.rs', 'src/api.rs']);
  const exists = (p) => known.has(p);
  const deps = (crateRelativeUses) => ({ crateRootFor: () => ({ srcDir: 'src', crateName: 'app', rootFiles: ['src/lib.rs'], fileIsRoot: false, crateRelativeUses }), rootDeclares: (f, name) => name === 'shapes' });

  it('reads the name in scope from edition 2018 on, and the path as written in edition 2015', () => {
    expect(resolveRustPath('use::2::crate::shapes::sh::Circle', 'src/api.rs', exists, deps(false))).toBe('src/shapes.rs');
    expect(resolveRustPath('use::2::crate::shapes::sh::Circle', 'src/api.rs', exists, deps(true))).toBeUndefined();
    expect(resolveRustPath('use::2::crate::other::shapes::Circle', 'src/api.rs', exists, deps(true))).toBe('src/shapes.rs');
  });

  it('gives no file for a form it cannot read', () => {
    for (const bad of ['use', 'use::x::crate::shapes::sh', 'use::0::sh::Circle', 'use::2::crate::shapes', 'use::1.5::crate::sh']) expect(resolveRustPath(bad, 'src/api.rs', exists, deps(false))).toBeUndefined();
  });
});

describe('resolveRustPath — a file is a module only when a mod declares it (injected deps)', () => {
  const known = new Set(['src/lib.rs', 'src/util/mod.rs', 'src/util/parse.rs', 'src/util/deep/leaf.rs', 'src/serve.rs', 'src/a.rs', 'src/a/b.rs', 'src/outer/x.rs', 'src/outer.rs']);
  const exists = (p) => known.has(p);
  const depsWith = (moduleDeclared, roots = []) => ({ crateRootFor: (f) => ({ srcDir: 'src', crateName: 'app', rootFiles: ['src/lib.rs'], fileIsRoot: roots.includes(f) }), rootDeclares: () => true, moduleDeclared });

  it('passes over a file the module above is known not to declare, and binds that module', () => {
    const deps = depsWith((file, path) => file === 'src/lib.rs' && path === 'util');
    expect(resolveRustPath('crate::util::parse', 'src/a.rs', exists, deps)).toBe('src/util/mod.rs');
    expect(resolveRustPath('crate::serve', 'src/a.rs', exists, deps)).toBe('src/lib.rs');
  });

  it('binds a file a module above declares, directly or through its inline modules', () => {
    const deps = depsWith((file, path) => (file === 'src/lib.rs' && (path === 'util' || path === 'util/deep/leaf' || path === 'outer/x')) || (file === 'src/util/mod.rs' && path === 'parse'));
    expect(resolveRustPath('crate::util::parse::old', 'src/a.rs', exists, deps)).toBe('src/util/parse.rs');
    expect(resolveRustPath('crate::util::deep::leaf::X', 'src/a.rs', exists, deps)).toBe('src/util/deep/leaf.rs');
    // src/outer.rs exists and declares no `x`, yet the root declares it through its inline module `outer`.
    expect(resolveRustPath('crate::outer::x', 'src/a.rs', exists, deps)).toBe('src/outer/x.rs');
  });

  it('binds a fitting file where nothing is known, unless it is the root of a target', () => {
    const unknown = depsWith(() => undefined, ['src/serve.rs']);
    expect(resolveRustPath('crate::util::parse', 'src/a.rs', exists, unknown)).toBe('src/util/parse.rs');
    expect(resolveRustPath('crate::serve::run', 'src/a.rs', exists, unknown)).toBe('src/lib.rs');
    // One file above is known not to declare it and another is not known: not ruled out.
    const mixed = depsWith((file) => (file === 'src/lib.rs' ? false : undefined));
    expect(resolveRustPath('crate::util::parse', 'src/a.rs', exists, mixed)).toBe('src/util/parse.rs');
    // A target root that a module above declares is its module.
    const declaredRoot = depsWith((file, path) => file === 'src/lib.rs' && path === 'serve', ['src/serve.rs']);
    expect(resolveRustPath('crate::serve::run', 'src/a.rs', exists, declaredRoot)).toBe('src/serve.rs');
  });

  it('asks the file of the module itself for a relative path, and binds as before without the check', () => {
    const deps = depsWith((file, path) => file === 'src/a.rs' && path === 'b');
    expect(resolveRustPath('self::b::X', 'src/a.rs', exists, deps)).toBe('src/a/b.rs');
    expect(resolveRustPath('self::b::X', 'src/a.rs', exists, depsWith(() => false))).toBe('src/a.rs');
    const plain = { crateRootFor: () => ({ srcDir: 'src', crateName: 'app', rootFiles: ['src/lib.rs'], fileIsRoot: true }) };
    expect(resolveRustPath('crate::serve::run', 'src/a.rs', exists, plain)).toBe('src/serve.rs');
  });
});

describe('declaredModules', () => {
  const read = (code) => withParsedFile('src/lib.rs', code, (tree) => declaredModules(tree.rootNode));
  const paths = (r) => r.declared.map((d) => `${d.path}@${d.line}`);

  it('lists every mod without a body, whatever stands in front of it, through inline modules and cfg_if! branches', async () => {
    const r = await read('mod a;\n#[path = "x.rs"]\nmod b;\n#[my_attr]\nmod c;\nmod outer {\n    #[cfg(unix)]\n    mod r#gen;\n    cfg_if! { if #[cfg(a)] { mod inner; mod deep { mod leaf; } } }\n}\ncfg_if::cfg_if! {\n    if #[cfg(unix)] { mod unix; } else { mod other; }\n}\nfn f() { mod local; }\nlazy_static! { static ref X: u8 = 1; }');
    expect(paths(r)).toEqual(['a@1', 'b@3', 'c@5', 'outer/gen@8', 'outer/inner@9', 'outer/deep/leaf@9', 'unix@12', 'other@12']);
    expect(r.known).toBe(true);
  });

  it('is not known to be whole under an unread macro, an unread inner attribute, a macro in a cfg_if! branch or a parse error', async () => {
    expect((await read('mod a;\nmodules!(b);')).known).toBe(false);
    expect((await read('mod a;\ninclude!("more.rs");')).known).toBe(false);
    expect((await read('mod outer { declare::them! { c } }')).known).toBe(false);
    expect((await read('#![my_crate_macro]\nmod a;')).known).toBe(false);
    expect((await read('mod outer {\n    #![cfg_attr(unix, path = "u")]\n    mod a;\n}')).known).toBe(false);
    expect((await read('#![cfg_attr(unix, /* c */ path = "u")]\nmod a;')).known).toBe(false);
    expect((await read('#![cfg_attr(unix, cfg_attr(docsrs, path = "u"))]\nmod a;')).known).toBe(false);
    expect((await read('#![cfg_attr(unix)]\nmod a;')).known).toBe(false);
    expect((await read('cfg_if! { if #[cfg(a)] { modules!(b); } }')).known).toBe(false);
    expect((await read('cfg_if! { if #[cfg(a)] { mod m { cfg_if! { if #[cfg(b)] { gen_mods! {} } } } } }')).known).toBe(false);
    expect((await read('mod a;\nfn broken( {')).known).toBe(false);
  });

  it('stays whole beside what declares no module', async () => {
    expect((await read('#![cfg_attr(docsrs, doc = "path")]\nmod a;')).known).toBe(true);
    const r = await read('#![no_std]\n#![cfg_attr(docsrs, feature(doc_cfg))]\ncfg_if! {\n    if #[cfg(a)] {\n        macro_rules! m { () => {}; }\n        thread_local! { static T: u8 = 1; }\n        const A: u8 = make!(1);\n        fn f() -> ! { panic!() }\n        cfg_if! { if #[cfg(b)] { static B: bool = !true; } }\n    }\n}\nfn g() { println!("x"); }\nbitflags! { struct F: u8 {} }\nstruct S;');
    expect(paths(r)).toEqual([]);
    expect(r.known).toBe(true);
  });
});

describe('pathModules', () => {
  const read = (code) => withParsedFile('src/lib.rs', code, (tree) => pathModules(tree.rootNode).map((m) => `${m.path}@${m.line}`));

  it('lists the normalized path of each path attribute on a top-level mod without a body', async () => {
    expect(await read('#[path = "platform/linux.rs"]\nmod sys;\n#[path = "./imp/../a//b.rs"]\n/// doc\n#[cfg(unix)]\npub mod b;\n#[path = "../shared/util.rs"]\nmod util;\n#[path = "x/../../up.rs"]\nmod up;')).toEqual(['platform/linux.rs@2', 'a/b.rs@6', '../shared/util.rs@8', '../up.rs@10']);
  });

  it('leaves out an inline module, a mod inside one, a cfg_attr, and a path it cannot place', async () => {
    expect(await read('#[path = "dir"]\nmod inline { }\nmod wrap {\n    #[path = "w.rs"]\n    mod w;\n}\n#[cfg_attr(unix, path = "u.rs")]\nmod u;\n#[path = "/abs/a.rs"]\nmod a;\n#[path = ""]\nmod e;\n#[path = "a\\\\b.rs"]\nmod w2;\n#[path = ".."]\nmod dots;\n#[path]\nmod bare;\n#[path = r"raw.rs"]\nmod raw;\n#[doc = "x"]\nmod plain;')).toEqual([]);
  });
});

describe('resolveRustPath — a file loaded through a path attribute (injected deps)', () => {
  const known = new Set(['src/lib.rs', 'src/platform/linux.rs', 'src/platform/epoll.rs', 'src/platform/linux/deep.rs', 'src/platform/mod.rs', 'src/other.rs']);
  const exists = (p) => known.has(p);
  const deps = (loaded) => ({ crateRootFor: (f) => ({ srcDir: 'src', crateName: 'app', rootFiles: ['src/lib.rs'], fileIsRoot: f === 'src/lib.rs' }), rootDeclares: () => true, pathLoaded: () => loaded });

  it('looks beside the file for what it names below itself, and keeps its items in the file', () => {
    expect(resolveRustPath('self::epoll', 'src/platform/linux.rs', exists, deps(true))).toBe('src/platform/epoll.rs');
    expect(resolveRustPath('self::epoll', 'src/platform/linux.rs', exists, deps(false))).toBe('src/platform/linux.rs');
    expect(resolveRustPath('self::Item', 'src/platform/linux.rs', exists, deps(true))).toBe('src/platform/linux.rs');
    expect(resolveRustPath('self', 'src/platform/linux.rs', exists, deps(true))).toBe('src/platform/linux.rs');
  });

  it('still reads the directory named after the file where nothing beside it fits, and reads super as before', () => {
    expect(resolveRustPath('self::deep', 'src/platform/linux.rs', exists, deps(true))).toBe('src/platform/linux/deep.rs');
    expect(resolveRustPath('super::Item', 'src/platform/linux.rs', exists, deps(true))).toBe('src/platform/mod.rs');
  });

  it('changes nothing for a mod.rs or a crate root', () => {
    expect(resolveRustPath('self::epoll', 'src/platform/mod.rs', exists, deps(true))).toBe('src/platform/epoll.rs');
    expect(resolveRustPath('self::other', 'src/lib.rs', exists, deps(true))).toBe('src/other.rs');
  });
});
