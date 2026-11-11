---
id: rust-root-extern-crate-alias-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Extern crate declarations; Preludes, Extern prelude (a crate bound with `extern crate` in the crate root is added to the extern prelude under the name it is bound to, so it is in scope in every module of the crate)"
---

## Rule

Edition 2021. The crate root `src/lib.rs` writes `extern crate engine_core as core2;`. An `extern crate` in the root module puts its name into the extern prelude, so `core2` names the path dependency `engine-core` in every module of the crate: `use core2::Engine;` in `src/api/client.rs` binds `engine-core/src/lib.rs` (node `dep`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
engine-core = { path = "engine-core" }
```

```toml path=engine-core/Cargo.toml
[package]
name = "engine-core"
edition = "2021"
```

```rust path=engine-core/src/lib.rs owner=dep
pub struct Engine;
```

```rust path=src/lib.rs owner=root
extern crate engine_core as core2;
mod api;
```

```rust path=src/api/mod.rs
mod client;
```

```rust path=src/api/client.rs
use core2::Engine;
```

## Expect

- src/lib.rs:1 -> node:dep            # the declaration names the crate engine_core
- src/lib.rs:2 -> node:api
- src/api/client.rs:1 -> node:dep     # `core2` is in the extern prelude and stands for engine_core

## Why

The alias is the only name the rest of the crate uses for the dependency. Dropping it loses the dependency of every module but the root.
