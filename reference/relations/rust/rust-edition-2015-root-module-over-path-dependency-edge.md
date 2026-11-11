---
id: rust-edition-2015-root-module-over-path-dependency-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Preludes, Extern prelude (in the 2015 edition, crates in the extern prelude cannot be referenced via use declarations); The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root)"
---

## Rule

Edition 2015. The package has a path dependency `util`, and its crate root `src/lib.rs` declares a module of its own with the same name, `mod util;`, and writes no `extern crate util;`. A `use` path is relative to the crate root, and a dependency is reachable from `use` only through an `extern crate` there, so `use util::slug;` in `src/api/a.rs` names the root's module and binds `src/util/mod.rs` (node `localutil`), never the dependency `util/src/lib.rs` (node `depsrc`).

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

```rust path=src/lib.rs owner=root
mod util;
mod api;
```

```rust path=src/util/mod.rs owner=localutil
pub fn slug() {}
```

```rust path=src/api/mod.rs
mod a;
```

```rust path=src/api/a.rs
use util::slug;
```

## Expect

- src/lib.rs:1 -> node:localutil
- src/lib.rs:2 -> node:api
- src/api/a.rs:1 -> node:localutil      # `util` is the module the crate root declares

## Why

Looking the first segment up among the path dependencies first points the edge at another crate, and the module the line really uses goes unseen.
