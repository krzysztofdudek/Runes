---
id: rust-module-through-include-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Macros (the built-in `include!` parses a file as items at the place it is written); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` writes `include!("mods.rs");` and `src/mods.rs` holds `mod late;`, and `src/main.rs` is a second crate with an `Opts` of its own. An included file is not followed, so no plain `mod` declaration leads from a root to `src/late/mod.rs`: the roots are tried in their usual order, and its `crate::Opts` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
include!("mods.rs");
pub struct Opts;
```

```rust path=src/mods.rs owner=root
mod late;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/late/mod.rs
use crate::Opts;
```

## Expect

- src/late/mod.rs:1 -> node:root
