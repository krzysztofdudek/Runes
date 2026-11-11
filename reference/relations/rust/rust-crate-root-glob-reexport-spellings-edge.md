---
id: rust-crate-root-glob-reexport-spellings-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Use declarations, Glob imports; Paths (`self`, `crate`)"
---

## Rule

The crate root of the path dependency `kit` names its globs three ways: `pub use self::types::*;`, `pub use crate::models::deep::*;` for a module two levels down, and a group, `pub use shapes::{round::*, Square};`. Each names a module of the root's own tree, and `use kit::{Order, Invoice, Arc};` in `app` binds the root file `kit/src/lib.rs` (node `kitroot`) for each of the three names.

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
mod models;
mod shapes;
pub use self::types::*;
pub use crate::models::deep::*;
pub use shapes::{round::*, Square};
```

```rust path=kit/src/types.rs owner=kitroot
pub struct Order;
```

```rust path=kit/src/models/mod.rs owner=kitroot
pub mod deep;
```

```rust path=kit/src/models/deep.rs owner=kitroot
pub struct Invoice;
```

```rust path=kit/src/shapes/mod.rs owner=kitroot
pub mod round;
pub struct Square;
```

```rust path=kit/src/shapes/round.rs owner=kitroot
pub struct Arc;
```

```rust path=app/src/lib.rs owner=root
use kit::Order;
use kit::Invoice;
use kit::Arc;
```

## Expect

- app/src/lib.rs:1 -> node:kitroot
- app/src/lib.rs:2 -> node:kitroot
- app/src/lib.rs:3 -> node:kitroot
