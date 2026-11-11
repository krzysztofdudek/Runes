---
id: rust-module-through-absolute-path-include-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Macros (the built-in `include!` parses a file as items at the place it is written); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` writes `::core::include!("mods.rs");`, the macro named by a path that starts with `::`, and `src/mods.rs` holds `mod late;`. `src/main.rs` is a second crate with an `Opts` of its own. No plain `mod late;` leads from a root to `src/late/mod.rs`, so which crate compiles it is not known: the roots are tried in their usual order, and `crate::Opts` binds `src/lib.rs` (owner root), the crate Rust compiles the file into.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
::core::include!("mods.rs");
pub struct Opts;
```

```rust path=src/mods.rs owner=root
mod late;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/late/mod.rs owner=late
use crate::Opts;
```

## Expect

- src/late/mod.rs:1 -> node:root

## Why

A file that no plain `mod` chain reaches may still be compiled, here through an included file. Silence would lose the edge to the library.
