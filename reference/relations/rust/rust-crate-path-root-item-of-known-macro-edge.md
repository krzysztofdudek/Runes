---
id: rust-crate-path-root-item-of-known-macro-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Paths, Path qualifiers (`crate` names the crate root); Use declarations (a `use` brings a name into the module that writes it)"
---

## Rule

A `crate::` path whose first segment the crate root file binds at its top level binds that file, in every edition. `src/lib.rs` (node `src`) defines `LIMIT` with `const`, brings in `Mode` with a top-level `use` under another name, and defines `REGISTRY` inside `lazy_static!`, an item macro whose items are read from its tokens. Each of the three `use` lines in `src/api/mod.rs` binds `src/lib.rs`. `Hidden` is defined only by a macro whose expansion is not known, so line 4 stays silent. The root takes `lazy_static!` and `define_types!` from the registry crates it depends on, with `#[macro_use] extern crate`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
[dependencies]
lazy_static = "1"
type-macros = "1"
```

```rust path=src/lib.rs
pub const LIMIT: usize = 8;
pub use std::fs::OpenOptions as Mode;
lazy_static! {
    pub static ref REGISTRY: Vec<u8> = Vec::new();
}
define_types! {
    pub struct Hidden;
}
#[macro_use]
extern crate lazy_static;
#[macro_use]
extern crate type_macros;
```

```rust path=src/api/mod.rs
use crate::LIMIT;
use crate::Mode;
use crate::REGISTRY;
use crate::Hidden;
```

## Expect

- src/api/mod.rs:1 -> node:src      # `const LIMIT` at the top level of src/lib.rs
- src/api/mod.rs:2 -> node:src      # `Mode`, the name the top-level `use … as Mode` brings in
- src/api/mod.rs:3 -> node:src      # `REGISTRY`, an item of `lazy_static!`

## Why

The names a crate root binds are read from its parse tree. What an unknown macro defines cannot be told from its tokens, so that edge is lost and never guessed.
