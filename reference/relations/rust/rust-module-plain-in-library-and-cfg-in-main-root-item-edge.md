---
id: rust-module-plain-in-library-and-cfg-in-main-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Conditional compilation (an item whose `cfg` predicate is false is removed from the crate); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` declares `mod x;`, and `src/main.rs` declares `#[cfg(any())] mod x;`, a predicate that is never true, so only the library compiles `src/x/mod.rs`. Both roots hold an `Opts`. The library root is the one root that certainly compiles the file and is tried first: `crate::Opts` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod x;
pub struct Opts;
```

```rust path=src/main.rs owner=bin
#[cfg(any())]
mod x;
struct Opts;
fn main() {}
```

```rust path=src/x/mod.rs owner=x
use crate::Opts;
```

## Expect

- src/lib.rs:1 -> node:x     # `mod x;` in the library root
- src/main.rs:2 -> node:x    # `mod x;` in the binary root, under its `cfg`
- src/x/mod.rs:1 -> node:root

## Why

A declaration that a `cfg` may remove does not prove that its root compiles the file, so it is not one of the two roots that make a root item untold.
