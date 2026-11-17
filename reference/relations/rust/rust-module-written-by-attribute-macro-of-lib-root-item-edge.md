---
id: rust-module-written-by-attribute-macro-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Procedural Macros (an attribute macro replaces the item it stands on with any items); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` puts the attribute macro `#[kit::modules(late)]` of the registry crate `kit`, a proc-macro crate the package depends on, on an item, and the macro writes `mod late;` beside it. `src/main.rs` is a second crate with an `Opts` of its own. No plain `mod late;` leads from a root to `src/late/mod.rs`, so the roots are tried in their usual order, and `crate::Opts` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
[dependencies]
kit = "1"
```

```rust path=src/lib.rs owner=root
#[kit::modules(late)]
struct Modules;
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
