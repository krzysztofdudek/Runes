---
id: rust-crate-root-glob-reexport-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Use declarations, Glob imports; Paths (`crate`)"
---

## Rule

`src/lib.rs` (node `root`) declares `mod types;` and writes `pub use types::*;`; `src/types/mod.rs` defines `Order`. `use crate::Order;` in `src/api/mod.rs` names the item the root's glob re-exports and binds the root file, as a named re-export of the item does.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod types;
mod api;
pub use types::*;
```

```rust path=src/types/mod.rs
pub struct Order;
```

```rust path=src/api/mod.rs
use crate::Order;
```

## Expect

- src/lib.rs:1 -> node:types
- src/lib.rs:2 -> node:api
- src/lib.rs:3 -> node:types
- src/api/mod.rs:1 -> node:root      # the root's glob brings `Order` in
