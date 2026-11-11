---
id: rust-crate-root-glob-module-without-name-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Use declarations, Glob imports (a glob brings in the public items of the module it names, and nothing else)"
---

## Rule

The crate root of the path dependency `kit` writes `pub use types::*;`, and `kit/src/types/mod.rs` defines `Invoice` only. `Order` is defined in `kit/src/models/mod.rs`, which the root declares and does not re-export. `use kit::Order;` in `app` names nothing the root brings in, so the root file is not bound.

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

```rust path=kit/src/lib.rs owner=kit
mod types;
mod models;
pub use types::*;
```

```rust path=kit/src/types/mod.rs owner=kit
pub struct Invoice;
```

```rust path=kit/src/models/mod.rs owner=kit
pub struct Order;
```

```rust path=app/src/lib.rs owner=root
use kit::Order;
```

## Expect

- silence      # the glob's module does not declare `Order`

## Why

A glob in the root is no licence to bind the root for every name: only a name the glob's module declares comes through it.
