// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/rust.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { rustExtractor } from '../../helpers/internal/relations.mjs';

const run = (code) => runExtractor(rustExtractor, 'rust', '.rs', code);

const specs = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

describe('rust extractor — uses()', () => {
  it('detects a single `use crate::payments::charge;` as the crate-relative path hint', async () => {
    const { uses } = await run('use crate::payments::charge;');
    expect(uses).toContainEqual(
      expect.objectContaining({
        candidates: [{ kind: 'path', specifier: 'crate::payments::charge' }],
        kind: 'import',
      }),
    );
  });

  it('strips the alias of a renamed `use crate::db::Repository as Repo;`', async () => {
    const { uses } = await run('use crate::db::Repository as Repo;');
    const s = specs(uses);
    expect(s).toContain('crate::db::Repository');
    expect(s).not.toContain('Repo');
  });

  it('emits every item of a crate-rooted group `use crate::{a::Foo, b::Bar};` on its own', async () => {
    // The group prefix `crate` names no module; each item path is its own dependency
    // (rustfmt imports_granularity = "Crate" / rust-analyzer merge-imports produce this).
    const { uses } = await run('use crate::{a::Foo, b::Bar};');
    expect(specs(uses)).toEqual(['crate::a::Foo', 'crate::b::Bar']);
  });

  it('joins each item to the deeper prefix `use crate::orders::{Order, sub::Deep};`', async () => {
    // A path item (`sub::Deep`) names its own module, never the prefix module.
    const { uses } = await run('use crate::orders::{Order, sub::Deep};');
    expect(specs(uses)).toEqual(['crate::orders::Order', 'crate::orders::sub::Deep']);
  });

  it('joins a `super::`-rooted group item by item `use super::{billing::Invoice, orders::Order};`', async () => {
    const { uses } = await run('use super::{billing::Invoice, orders::Order};');
    expect(specs(uses)).toEqual(['super::billing::Invoice', 'super::orders::Order']);
  });

  it('emits the prefix module for a glob `use crate::events::*;`', async () => {
    const { uses } = await run('use crate::events::*;');
    expect(specs(uses)).toEqual(['crate::events']);
  });

  it('emits the path for a `pub use` re-export (visibility is irrelevant to the edge)', async () => {
    const { uses } = await run('pub use crate::api::Handler;');
    expect(specs(uses)).toEqual(['crate::api::Handler']);
  });

  it('keeps `super::` and `self::` roots verbatim in the specifier', async () => {
    expect(specs((await run('use super::util::X;')).uses)).toEqual(['super::util::X']);
    expect(specs((await run('use self::y::Z;')).uses)).toEqual(['self::y::Z']);
  });

  it('emits an external-crate path verbatim (the resolver, not the extractor, silences it)', async () => {
    const { uses } = await run('use std::collections::HashMap;');
    expect(specs(uses)).toEqual(['std::collections::HashMap']);
  });

  it('handles multiple use declarations in one file', async () => {
    const { uses } = await run(
      'use crate::a::A;\nuse crate::b::*;\nuse super::c::C as Cc;\n',
    );
    const s = specs(uses);
    expect(s).toEqual(
      expect.arrayContaining(['crate::a::A', 'crate::b', 'super::c::C']),
    );
    expect(s).toHaveLength(3);
  });

  it('never reaches into a macro invocation token tree (macro deps are invisible)', async () => {
    // A `crate::…` path appearing only inside a macro call is unparsed tokens, never a
    // use_declaration → zero hints.
    const { uses } = await run('fn f() {\n  println!("{}", crate::config::NAME);\n}\n');
    expect(specs(uses)).toEqual([]);
  });

  it('reports the line of each import', async () => {
    const { uses } = await run('\n\nuse crate::a::A;\n');
    expect(uses[0]?.line).toBe(3);
  });

  it('emits each leaf of a group, all on the group`s line', async () => {
    // `use crate::orders::{Order, Other};` — each leaf resolves on its own (to the module
    // file when it is an item of `crate::orders`); the pass collapses same-line edges to
    // one node into one finding.
    const { uses } = await run('use crate::orders::{Order, Other};');
    expect(specs(uses)).toEqual(['crate::orders::Order', 'crate::orders::Other']);
    expect(new Set(uses.map((u) => u.line))).toEqual(new Set([1]));
  });

  it('emits the prefix for a glob whose prefix is a PLAIN identifier `use foo::*;`', async () => {
    // The wildcard prefix `foo` is a bare `identifier` (not a `scoped_identifier`), so the
    // specifier is the node text `foo` — exercising the ELSE branch of the prefix render.
    const { uses } = await run('use foo::*;');
    expect(specs(uses)).toEqual(['foo']);
  });

  it('emits the prefix for a glob whose prefix is a `crate` keyword `use crate::*;`', async () => {
    const { uses } = await run('use crate::*;');
    expect(specs(uses)).toEqual(['crate']);
  });

  it('emits a leading-`::` path `use ::foo::Bar;` without the `::`', async () => {
    // The leading `::` produces a scoped_identifier whose leftmost leaf has no `path` field: the path is `foo::Bar`, the crate root's `foo` in edition 2015 and the crate `foo` from edition 2018 on.
    const { uses } = await run('use ::foo::Bar;');
    expect(specs(uses)).toEqual(['foo::Bar']);
  });

  it('falls back to emitting each list item when a group has NO common prefix `use ::{a, b};`', async () => {
    // A leading-`::` group has no usable prefix path, so the edge is preserved by emitting
    // each list item individually rather than being silently dropped.
    const { uses } = await run('use ::{a, b};');
    expect(specs(uses).sort()).toEqual(['a', 'b']);
  });

  it('dedups identical list items emitted from the prefix-less group fallback `use ::{a, a};`', async () => {
    // Both items render to `a` on the same line; the second is deduped (specifier+line key).
    const { uses } = await run('use ::{a, a};');
    expect(specs(uses)).toEqual(['a']);
    expect(uses).toHaveLength(1);
  });

  it('joins each item to a leading-`::` group prefix `use ::foo::{Bar, Baz};`', async () => {
    // The items keep their prefix `foo`: they are never emitted bare (`Bar`, `Baz`), which would re-root them at the top level.
    const { uses } = await run('use ::foo::{Bar, Baz};');
    expect(specs(uses)).toEqual(['foo::Bar', 'foo::Baz']);
  });

  it('emits the prefix of a leading-`::` glob `use ::foo::*;`', async () => {
    const { uses } = await run('use ::foo::*;');
    expect(specs(uses)).toEqual(['foo']);
  });

  it('resolves a renamed import via its `path` field only `use a as b;`', async () => {
    // The alias `b` is a local binding; the emitted specifier is the real path `a`.
    const { uses } = await run('use a as b;');
    expect(specs(uses)).toEqual(['a']);
  });

  it('emits the path of a leading-`::` renamed import `use ::foo as bar;`', async () => {
    const { uses } = await run('use ::foo as bar;');
    expect(specs(uses)).toEqual(['foo']);
  });

  it('emits the prefix module for the `self` item of a group `use crate::a::{self, B};`', async () => {
    // The `self` leaf means the prefix module itself; `B` resolves on its own.
    const { uses } = await run('use crate::a::{self, B};');
    expect(specs(uses)).toEqual(['crate::a', 'crate::a::B']);
  });

  it('emits a bare top-level identifier import `use foo;`', async () => {
    // A non-grouped, non-scoped argument at the top level: empty prefix → the tail itself.
    const { uses } = await run('use foo;');
    expect(specs(uses)).toEqual(['foo']);
  });

  it('emits nothing for a glob with no prefix path `use ::*;`', async () => {
    // The wildcard has no prefix node (bare `*`), so there is nothing to emit.
    const { uses } = await run('use ::*;');
    expect(specs(uses)).toEqual([]);
  });

  it('emits every item of a bare top-level brace list `use {a, b};`', async () => {
    // Issue 017: a bare `use {a, b};` parses with the brace list (`use_list`) as the argument node directly; each item resolves on its own from the top level, as in a prefix-less group.
    const { uses } = await run('use {a, b};');
    expect(specs(uses)).toEqual(['a', 'b']);
  });

  it('emits every item of a top-level brace list of paths `use {core_lib::Invoice, std::fmt::Debug};`', async () => {
    const { uses } = await run('use {core_lib::Invoice, std::fmt::Debug};');
    expect(specs(uses)).toEqual(['core_lib::Invoice', 'std::fmt::Debug']);
  });

  it('descends a nested group inside a top-level brace list `use { core_lib::{Invoice, total}, std::fmt::Debug };`', async () => {
    const { uses } = await run('use { core_lib::{Invoice, total}, std::fmt::Debug };');
    expect(specs(uses)).toEqual(['core_lib::Invoice', 'core_lib::total', 'std::fmt::Debug']);
  });

  it('emits the items of a top-level brace list re-export `pub use {core_lib::total};`', async () => {
    const { uses } = await run('pub use {core_lib::total};');
    expect(specs(uses)).toEqual(['core_lib::total']);
  });

  it('skips a comment between the items of a group `use crate::{a, /* note */ b};`', async () => {
    // The comment is a named child of the list, an argument shape that names no path.
    const { uses } = await run('use crate::{a, /* note */ b};');
    expect(specs(uses)).toEqual(['crate::a', 'crate::b']);
  });

  it('descends a nested group with the accumulated prefix `use crate::a::{b::{C, D}, e};`', async () => {
    const { uses } = await run('use crate::a::{b::{C, D}, e};');
    expect(specs(uses)).toEqual(['crate::a::b::C', 'crate::a::b::D', 'crate::a::e']);
  });

  it('strips the raw-identifier prefix from every segment (`mod r#gen;`, `crate::r#gen::X`)', async () => {
    const { uses } = await run('mod r#gen;\nuse crate::r#gen::r#try::X;\n');
    expect(specs(uses)).toEqual(['self::gen', 'crate::gen::try::X']);
  });

  it('emits `extern crate name as alias;` as `extern::name`, the crate named for certain', async () => {
    const { uses } = await run('extern crate core_lib as cl;\nextern crate self as me;\n');
    expect(specs(uses)).toEqual(['extern::core_lib']);
  });
});

describe('rust extractor — inline modules rebase self/super to the file module', () => {

  it('emits a use that starts with a name an extern crate of its own scope binds as the crate and the path as written, and leaves every other scope alone', async () => {
    const code = [
      'extern crate core_lib as cl;',
      'extern crate r#plain;',
      'extern crate self as me;',
      'use cl::Engine;',
      'use plain::{A, deep::B};',
      'use me::Own;',
      'use other::X;',
      'mod inner {',
      '    use cl::Hidden;',
      '    extern crate tools as t;',
      '    use t::Wrench;',
      '}',
      'fn f() {',
      '    extern crate local as l;',
      '    use l::Thing;',
      '    use cl::NotHere;',
      '}',
      'use t::Outside;',
    ].join('\n');
    const { uses } = await run(code);
    expect(specs(uses)).toEqual([
      'extern::core_lib', 'extern::plain',
      'extern::core_lib::as::cl::Engine', 'extern::plain::as::plain::A', 'extern::plain::as::plain::deep::B', 'me::Own', 'other::X',
      'cl::Hidden', 'extern::tools', 'extern::tools::as::t::Wrench',
      'extern::local', 'extern::local::as::l::Thing', 'cl::NotHere',
      't::Outside',
    ]);
  });
  it('`use super::*` inside one inline `mod tests` is the file module itself (`self`)', async () => {
    const { uses } = await run('mod tests {\n    use super::*;\n    use super::place as p;\n}\n');
    expect(specs(uses)).toEqual(['self', 'self::place']);
  });

  it('`super::super::x` inside one inline module climbs once from the file module', async () => {
    const { uses } = await run('mod tests {\n    use super::super::x::Y;\n}\n');
    expect(specs(uses)).toEqual(['super::x::Y']);
  });

  it('`super` inside two nested inline modules pops one and keeps the outer one', async () => {
    const { uses } = await run('mod outer {\n    mod inner {\n        use super::z::Z;\n    }\n}\n');
    expect(specs(uses)).toEqual(['self::outer::z::Z']);
  });

  it('`self::` and a file-backed `mod x;` inside an inline module splice the inline path in', async () => {
    const { uses } = await run('mod outer {\n    mod inner;\n    use self::inner::Deep;\n}\n');
    expect(specs(uses)).toEqual(['self::outer::inner', 'self::outer::inner::Deep']);
  });

  it('`crate::` inside an inline module is unaffected', async () => {
    const { uses } = await run('mod tests {\n    use crate::a::B;\n}\n');
    expect(specs(uses)).toEqual(['crate::a::B']);
  });

  it('relative paths under a `#[path]`-relocated inline module are silenced', async () => {
    const { uses } = await run('#[path = "elsewhere"]\nmod outer {\n    mod inner;\n    use super::x::Y;\n    use crate::a::B;\n}\n');
    expect(specs(uses)).toEqual(['crate::a::B']);
  });
});

describe('rust extractor — declarations()', () => {
  it('returns top-level struct / enum / trait / fn / mod names', async () => {
    const { declarations } = await run(
      'pub struct Order { id: u32 }\nenum E { A }\ntrait T {}\nfn f() {}\nmod m;\n',
    );
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toEqual(expect.arrayContaining(['Order', 'E', 'T', 'f', 'm']));
  });

  it('does not descend into an inline `mod { … }` for nested items', async () => {
    const { declarations } = await run('mod inline { fn g() {} struct Inner {} }\n');
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('inline');
    expect(keys).not.toContain('g');
    expect(keys).not.toContain('Inner');
  });

  it('ignores top-level items that are not struct/enum/trait/fn/mod (impl, const, static, use)', async () => {
    // Only the five named item kinds become declarations; an `impl` (no name), a `const`,
    // a `static`, and a `use` are all skipped by the item-type filter. Every name the top level binds as an item is declared besides, under its own `item:` key.
    const { declarations } = await run(
      'use crate::a;\nstruct S {}\nimpl S {}\nconst X: u32 = 1;\nstatic Y: u32 = 2;\n',
    );
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys.filter((k) => !k.startsWith('item:'))).toEqual(['S']);
    expect(keys.filter((k) => k.startsWith('item:'))).toEqual(['item:a', 'item:S', 'item:X', 'item:Y']);
  });

  it('reports the line of a top-level declaration', async () => {
    const { declarations } = await run('\nstruct Order {}\n');
    expect(declarations[0]?.symbolKey).toBe('Order');
    expect(declarations[0]?.line).toBe(2);
  });
});

describe('rust extractor — a use path that starts with a name in scope', () => {
  it('emits what a declared module stands for in front of the path as written', async () => {
    const { uses } = await run('mod shapes;\npub use shapes::Circle;\nuse shapes::{self, deep::Arc};\nuse shapes::*;');
    expect(specs(uses)).toEqual(['self::shapes', 'use::2::self::shapes::shapes::Circle', 'use::2::self::shapes::shapes', 'use::2::self::shapes::shapes::deep::Arc', 'use::2::self::shapes::shapes']);
  });

  it('follows the name another use bound: a path, a group member, an alias, a self member, and a chain of them', async () => {
    const { uses } = await run('use crate::a;\nuse crate::g::{b, c as d, e::{self}};\nuse a::X;\nuse b::X;\nuse d::X;\nuse e::X;\nuse a::n;\nuse n::Y;');
    expect(specs(uses).slice(4)).toEqual([
      'use::2::crate::a::a::X', 'use::3::crate::g::b::b::X', 'use::3::crate::g::c::d::X', 'use::3::crate::g::e::e::X', 'use::2::crate::a::a::n', 'use::3::crate::a::n::n::Y',
    ]);
  });

  it('leaves a path alone when nothing in scope binds its first name, when only the path itself does, or when two uses disagree', async () => {
    const { uses } = await run('use tokio;\nuse tokio::sync::Mutex;\nuse own::own;\n#[cfg(unix)]\nuse crate::unix as sys;\n#[cfg(windows)]\nuse crate::windows as sys;\nuse sys::Handle;\nuse crate::k as _;');
    expect(specs(uses)).toEqual(['tokio', 'tokio::sync::Mutex', 'own::own', 'crate::unix', 'crate::windows', 'sys::Handle', 'crate::k']);
  });

  it('takes two uses that bind the name to the same path as one', async () => {
    const { uses } = await run('use crate::m::v;\nuse crate::m::v;\nuse v::X;');
    expect(specs(uses)).toContain('use::3::crate::m::v::v::X');
  });

  it('gives up on a ring of names', async () => {
    const { uses } = await run('use b::x as a;\nuse a::y as b;');
    expect(specs(uses)).toEqual(['b::x', 'a::y']);
  });

  it('reads the names of the blocks and the module around a use, and none of an outer module', async () => {
    const { uses } = await run('use crate::shapes as sh;\nmod top;\nfn f() {\n    use crate::other as o;\n    {\n        use o::A;\n        use sh::B;\n        use top::C;\n    }\n}\nimpl T { fn g() { use sh::D; } }\nmod inner {\n    use sh::E;\n    mod deep;\n    fn h() { use deep::F; mod blocked; use blocked::G; }\n}');
    expect(specs(uses)).toEqual([
      'crate::shapes', 'self::top', 'crate::other', 'use::2::crate::other::o::A', 'use::2::crate::shapes::sh::B', 'use::2::self::top::top::C', 'use::2::crate::shapes::sh::D',
      'sh::E', 'self::inner::deep', 'use::3::self::inner::deep::deep::F', 'self::inner::blocked', 'blocked::G',
    ]);
  });

  it('emits the path as written under an inline module whose directory a path attribute moved', async () => {
    const { uses } = await run('#[path = "elsewhere"]\nmod outer {\n    mod m;\n    use m::X;\n    use crate::k;\n    use k::Y;\n}');
    expect(specs(uses)).toEqual(['m::X', 'crate::k', 'use::2::crate::k::k::Y']);
  });

  it('prefers the crate an extern crate of the same scope binds', async () => {
    const { uses } = await run('extern crate core_lib as cl;\nmod cl;\nuse cl::Engine;');
    expect(specs(uses)).toEqual(['extern::core_lib', 'self::cl', 'extern::core_lib::as::cl::Engine']);
  });
});

describe('rust extractor — the globs of a file', () => {
  it('declares the path of each top-level glob, in a group too, and none that starts with ::', async () => {
    const { declarations } = await run('pub use types::*;\nuse self::a::{b::*, C, d::{e::*}};\nuse crate::r#gen::*;\nuse ::kit::*;\nuse {f::*};\nmod inner { use hidden::*; }\nfn f() { use local::*; }');
    expect(declarations.filter((d) => d.symbolKey.startsWith('glob:')).map((d) => `${d.symbolKey}@${d.line}`)).toEqual(['glob:types@1', 'glob:self::a::b@2', 'glob:self::a::d::e@2', 'glob:crate::gen@3', 'glob:f@5']);
  });
});

describe('rust extractor — a use path that starts with ::', () => {
  it('emits the path without the :: in every form of the use tree, and never as a name in scope', async () => {
    const { uses } = await run('mod shapes;\nuse ::shapes::Circle;\nuse ::{a, b::C};\nuse ::shapes::{A, deep::B};\nuse ::shapes::*;\nuse ::shapes as s;\nuse ::x;\nuse ::lead::lead2;\nuse lead2::Z;');
    expect(specs(uses)).toEqual(['self::shapes', 'shapes::Circle', 'a', 'b::C', 'shapes::A', 'shapes::deep::B', 'shapes', 'shapes', 'x', 'lead::lead2', 'lead2::Z']);
  });

  it('emits no inline path that starts with ::', async () => {
    const { uses } = await run('fn f(a: ::shapes::Circle) { ::shapes::make(); }');
    expect(specs(uses)).toEqual([]);
  });
});

describe('rust extractor — a path attribute and what stands between it and its mod', () => {
  it('skips the mod behind a doc comment, a line comment, a block comment and another attribute', async () => {
    const { uses } = await run('#[path = "a.rs"]\n/// doc\nmod a;\n#[path = "b.rs"]\n// line\n/* block */\n#[allow(dead_code)]\nmod b;\n/// doc only\nmod c;\n#[cfg(unix)]\n/** block doc */\nmod d;');
    expect(specs(uses)).toEqual(['self::c', 'self::d']);
  });

  it('silences what an inline module holds when a comment follows its path attribute', async () => {
    const { uses } = await run('#[path = "elsewhere"]\n/// doc\nmod outer {\n    mod inner;\n    use self::inner::X;\n}');
    expect(specs(uses)).toEqual([]);
  });
});
