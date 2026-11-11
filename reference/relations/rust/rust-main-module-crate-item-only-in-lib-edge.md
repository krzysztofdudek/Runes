---
id: rust-main-module-crate-item-only-in-lib-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate); Rust Reference, Use declarations (a glob import brings the public items of a module into scope)"
---

## Rule

`src/main.rs` declares `mod cli;` and brings the library's items in with `use app::*;`, so `crate::Shared` in `src/cli/mod.rs` is the library's `Shared`, seen through the binary root. The binary root is tried first and holds no `Shared` of its own, so the next root in the usual order, `src/lib.rs` (owner root), binds it.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
pub struct Shared;
```

```rust path=src/main.rs owner=bin
mod cli;
use app::*;
fn main() {}
```

```rust path=src/cli/mod.rs owner=cli
use crate::Shared;
```

## Expect

- src/main.rs:1 -> node:cli   # `mod cli;` in the binary root
- src/main.rs:2 -> node:root  # `use app::*;` names the library
- src/cli/mod.rs:1 -> node:root

## Why

A name the known root does not hold itself may reach it through a glob import or a macro. The other roots keep the edge they gave before.
