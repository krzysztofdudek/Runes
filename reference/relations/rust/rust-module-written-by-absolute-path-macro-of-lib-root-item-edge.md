---
id: rust-module-written-by-absolute-path-macro-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Macros By Example (a macro invocation may expand to items, a `mod` among them); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` invokes `::kit::decl_mods!(late);`, a macro of another crate (the registry crate `kit` the package depends on) named by a path that starts with `::`, which writes `mod late;`. `src/main.rs` is a second crate with an `Opts` of its own. No plain `mod late;` leads from a root to `src/late/mod.rs`, so which crate compiles it is not known: the roots are tried in their usual order, and `crate::Opts` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
[dependencies]
kit = "1"
```

```rust path=src/lib.rs owner=root
::kit::decl_mods!(late);
pub struct Opts;
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

What a macro expands to is not read. A module it writes keeps the edge it had before roots were told apart.
