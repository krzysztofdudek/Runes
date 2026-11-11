---
id: rust-module-with-path-attribute-in-mod-rs-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Modules (the `path` attribute names the file of a module, relative to the directory of a `mod.rs`); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` declares `mod sys;`, and `src/sys/mod.rs` declares `#[path = "../shared/imp.rs"] mod imp;`. `src/main.rs` is a second crate with an `Opts` of its own. No root declares a module called `shared`, and no plain `mod` chain reaches `src/shared/imp.rs`, so the roots are tried in their usual order, and its `crate::Opts` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod sys;
pub struct Opts;
```

```rust path=src/sys/mod.rs owner=root
#[path = "../shared/imp.rs"]
mod imp;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/shared/imp.rs owner=shared
use crate::Opts;
```

## Expect

- src/shared/imp.rs:1 -> node:root
