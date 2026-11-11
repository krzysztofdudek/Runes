---
id: rust-edition-2015-path-dependency-without-extern-crate-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Preludes, Extern prelude (in the 2015 edition, crates in the extern prelude cannot be referenced via use declarations)"
---

## Rule

Edition 2015. The package has a path dependency `util`, but the crate root `src/lib.rs` (node `src`) neither declares a module or an item `util` nor writes `extern crate util;`. A `use` path is relative to the crate root, where nothing is called `util`, so `use util::slug;` in `src/api/a.rs` names nothing and stays silent.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[dependencies]
util = { path = "util" }
```

```toml path=util/Cargo.toml
[package]
name = "util"
```

```rust path=util/src/lib.rs owner=depsrc
pub fn slug() {}
```

```rust path=src/lib.rs
pub struct Unrelated;
```

```rust path=src/api/a.rs
use util::slug;
```

## Expect

- silence      # the root binds no `util`: in edition 2015 the dependency is reachable from `use` only through `extern crate util;` in the root

## Why

A dependency listed in the manifest is not in scope of a `use` in edition 2015. Binding it anyway gives an edge for a path that names nothing.
