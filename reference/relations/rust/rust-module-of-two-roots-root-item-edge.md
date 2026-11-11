---
id: rust-module-of-two-roots-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate); Cargo targets.rs inferred_lib, inferred_bins (src/lib.rs and src/main.rs are two crates)"
---

## Rule

`src/lib.rs` and `src/main.rs` both declare `mod shared;`, so `src/shared/mod.rs` is certainly compiled into two crates, and its `crate::Opts` is the library's `Opts` in one and the binary's in the other. Which root the item belongs to cannot be told, so it gives no edge. Only the `mod` declarations of the two roots are edges.

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

## Expect

- src/lib.rs:1 -> node:shared    # `mod shared;` in the library root
- src/main.rs:1 -> node:shared   # `mod shared;` in the binary root
# no edge from src/shared/mod.rs:1: two roots declare the module

## Why

Binding the first root that holds the name would name one crate for a path that means two.
