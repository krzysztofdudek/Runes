---
id: rust-module-of-two-roots-or-none-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate); Cargo targets.rs inferred_lib, inferred_bins (src/lib.rs and src/main.rs are two crates)"
---

## Rule

`src/lib.rs` and `src/main.rs` both declare `mod shared;`, so `src/shared/mod.rs` is compiled into two crates, and its `crate::Opts` is the library's `Opts` in one and the binary's in the other. Which root the item belongs to cannot be told, so it gives no edge. A second module, `src/orphan/mod.rs`, is declared by neither root: no crate compiles it, so its `crate::Opts` gives no edge either. Only the `mod` declarations of the two roots are edges.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod shared;
pub struct Opts;
```

```rust path=src/main.rs owner=bin
mod shared;
struct Opts;
fn main() {}
```

```rust path=src/shared/mod.rs
use crate::Opts;
```

```rust path=src/orphan/mod.rs
use crate::Opts;
```

## Expect

- src/lib.rs:1 -> node:shared    # `mod shared;` in the library root
- src/main.rs:1 -> node:shared   # `mod shared;` in the binary root
# no edge from src/shared/mod.rs:1 (two roots declare the module) and none from src/orphan/mod.rs:1 (no root does)

## Why

Binding the first root that happens to hold the name would put an edge on a crate the file may not belong to.
