---
id: rust-edition-2015-root-extern-crate-alias-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Extern crate declarations (`extern crate a as b;` binds the crate under the name `b` in the module that writes it); The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root)"
---

## Rule

Edition 2015. The crate root `src/lib.rs` writes `extern crate engine_core as core2;`, so `core2` is a name of the crate root that stands for the path dependency `engine-core`. A `use` path is relative to the crate root, so `use core2::Engine;` in the module `src/api/c.rs` names the dependency and binds its root `engine-core/src/lib.rs` (node `dep`).

## Files

```toml path=Cargo.toml
[package]
name = "app"

[dependencies]
engine-core = { path = "engine-core" }
```

```toml path=engine-core/Cargo.toml
[package]
name = "engine-core"
```

```rust path=engine-core/src/lib.rs owner=dep
pub struct Engine;
```

```rust path=src/lib.rs owner=root
extern crate engine_core as core2;
mod api;
```

```rust path=src/api/mod.rs
mod c;
```

```rust path=src/api/c.rs
use core2::Engine;
```

## Expect

- src/lib.rs:1 -> node:dep      # the declaration names the crate engine_core
- src/lib.rs:2 -> node:api
- src/api/c.rs:1 -> node:dep    # `core2` is the root's name for engine_core

## Why

The alias is the only name the rest of the crate uses for the dependency. Dropping it loses the dependency of every module but the root.
