---
id: rust-edition-2018-use-crate-not-local-name-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Use declarations; Preludes, Extern prelude (a first segment no name of the module shadows names a crate)"
---

## Rule

Edition 2021. The package has a path dependency `kit`. `src/lib.rs` writes `use kit::Order;`, and nothing in that module is called `kit`: the path names the crate and binds `kit/src/lib.rs` (node `dep`). A module called `kit` exists elsewhere in the crate, declared by `src/api/mod.rs` (`src/api/kit.rs`, node `api`), and is no name of the root module. `src/api/mod.rs` writes `use kit::Local;`, where `kit` is its own module.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { path = "kit" }
```

```toml path=kit/Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=kit/src/lib.rs owner=dep
pub struct Order;
```

```rust path=src/lib.rs owner=root
mod api;
use kit::Order;
```

```rust path=src/api/mod.rs
mod kit;
use kit::Local;
```

```rust path=src/api/kit.rs
pub struct Local;
```

## Expect

- src/lib.rs:1 -> node:api
- src/lib.rs:2 -> node:dep      # no name of the root module is `kit`: the crate

## Why

A module of that name somewhere else in the crate is not in scope here, so the crate keeps the edge.
