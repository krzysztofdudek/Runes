---
id: rust-lib-path-in-src-subdir-beside-main-crate-path-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs normalize_lib, inferred_bins (src/main.rs); Rust Reference, Modules"
---

## Rule

`[lib] path = "src/core/lib.rs"` beside an inferred `src/main.rs` that declares `mod util;` (its own `src/util/mod.rs`). In the library module `src/core/engine/mod.rs`, `crate::util::Helper` is the library's `src/core/util/mod.rs`, never the binary's `src/util/mod.rs` (owner bin_util).

## Files

```toml path=Cargo.toml
[package]
name = "shop"
edition = "2021"

[lib]
path = "src/core/lib.rs"
```

```rust path=src/main.rs
mod util;
fn main() {}
```

```rust path=src/util/mod.rs owner=bin_util
pub struct Helper;
```

```rust path=src/core/lib.rs
mod engine;
mod util;
```

```rust path=src/core/util/mod.rs
pub struct Helper;
```

```rust path=src/core/engine/mod.rs
use crate::util::Helper;
```

## Expect

- src/core/engine/mod.rs:1 -> node:util
- src/core/lib.rs:1 -> node:engine
- src/core/lib.rs:2 -> node:util
- src/main.rs:1 -> node:bin_util
