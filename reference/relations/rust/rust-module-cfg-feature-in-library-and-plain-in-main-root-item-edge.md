---
id: rust-module-cfg-feature-in-library-and-plain-in-main-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Conditional compilation (an item whose `cfg` predicate is false is removed from the crate); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/main.rs` declares `mod x;`, and `src/lib.rs` declares `#[cfg(feature = "never")] mod x;`, which the library compiles only with a feature that may be off. The binary root is the one root that certainly compiles `src/x/mod.rs` and is tried first: `crate::Opts`, which only `src/main.rs` holds, binds `src/main.rs` (owner bin).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[cfg(feature = "never")]
mod x;
```

```rust path=src/main.rs owner=bin
mod x;
struct Opts;
fn main() {}
```

```rust path=src/x/mod.rs owner=x
use crate::Opts;
```

## Expect

- src/lib.rs:2 -> node:x     # `mod x;` in the library root, under its `cfg`
- src/main.rs:1 -> node:x    # `mod x;` in the binary root
- src/x/mod.rs:1 -> node:bin

## Why

A declaration that a `cfg` may remove does not prove that its root compiles the file, so it is not one of the two roots that make a root item untold.
