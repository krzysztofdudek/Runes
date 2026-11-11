---
id: rust-path-dependency-root-glob-reexport-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Use declarations, Glob imports (a `pub use m::*;` in a crate root makes every public item of `m` a path from the root); The Cargo Book — Specifying dependencies"
---

## Rule

The path dependency `kit` has the crate root `mod types; pub use types::*;`, and `kit/src/types/mod.rs` defines `Order`. In `app`, `use kit::Order;` names the item the root's glob re-exports, so it binds the root file `kit/src/lib.rs` (node `kitroot`), as a named re-export of the item does. It is the only edge between the two crates. In the root itself the glob's path starts with the module the root declares, so line 2 binds `kit/src/types/mod.rs` (node `types`).

## Files

```toml path=app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { path = "../kit" }
```

```toml path=kit/Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=kit/src/lib.rs owner=kitroot
mod types;
pub use types::*;
```

```rust path=kit/src/types/mod.rs
pub struct Order;
```

```rust path=app/src/lib.rs owner=root
use kit::Order;
```

## Expect

- kit/src/lib.rs:1 -> node:types
- kit/src/lib.rs:2 -> node:types      # `types` is the module the root declares
- app/src/lib.rs:1 -> node:kitroot    # the root's glob brings `Order` in

## Why

A root that names no item itself still re-exports the items of the module its glob names. Asking only for a name the root writes loses every import of a crate built this way.
