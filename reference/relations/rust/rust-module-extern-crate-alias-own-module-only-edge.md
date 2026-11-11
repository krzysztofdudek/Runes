---
id: rust-module-extern-crate-alias-own-module-only-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Extern crate declarations (the name is bound in the module that writes the declaration); Preludes, Extern prelude (only an `extern crate` in the crate root adds its name to the extern prelude)"
---

## Rule

Edition 2021. `extern crate engine_core as core2;` stands in the module `src/api/mod.rs`, not in the crate root, so `core2` is a name of that module alone. There `use core2::Engine;` binds the path dependency's root `engine-core/src/lib.rs` (node `dep`). In `src/other/mod.rs` the same `use` names a crate `core2` that nothing binds, and stays silent.

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
mod api;
mod other;
```

```rust path=src/api/mod.rs
extern crate engine_core as core2;
use core2::Engine;
```

```rust path=src/other/mod.rs
use core2::Engine;
```

## Expect

- src/lib.rs:1 -> node:api
- src/lib.rs:2 -> node:other
- src/api/mod.rs:1 -> node:dep      # the declaration names the crate engine_core
- src/api/mod.rs:2 -> node:dep      # `core2` is bound in this module

## Why

Taking an alias written anywhere in the crate for a name of the whole crate would bind `core2` in modules where it names nothing.
