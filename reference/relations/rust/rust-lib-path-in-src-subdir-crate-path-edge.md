---
id: rust-lib-path-in-src-subdir-crate-path-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs normalize_lib (lib.path as written); Rust Reference, Modules (a crate root's `mod x;` is beside it)"
---

## Rule

`[lib] path = "src/core/lib.rs"`: the library's module tree is rooted at `src/core/`. In its module `src/core/engine/mod.rs`, `crate::util::Helper` is `src/core/util/mod.rs` and `crate::Item` the root `src/core/lib.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "shop"
edition = "2021"

[lib]
path = "src/core/lib.rs"
```

```rust path=src/core/lib.rs
mod engine;
mod util;
pub struct Item;
```

```rust path=src/core/util/mod.rs
pub struct Helper;
```

```rust path=src/core/engine/mod.rs
use crate::util::Helper;
use crate::Item;
```

## Expect

- src/core/engine/mod.rs:1 -> node:util
- src/core/engine/mod.rs:2 -> node:core
- src/core/lib.rs:1 -> node:engine
- src/core/lib.rs:2 -> node:util
