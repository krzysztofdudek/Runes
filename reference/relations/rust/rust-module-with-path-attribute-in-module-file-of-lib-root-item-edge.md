---
id: rust-module-with-path-attribute-in-module-file-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Modules (the `path` attribute names the file of a module); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` declares `mod sys;`, and `src/sys.rs` declares `#[path = "unix.rs"] mod imp;`, which puts the module in `src/unix.rs`. `src/main.rs` is a second crate with an `Opts` of its own. Both roots are plain, yet no root declares a module called `unix`: the file is reached through a file below a root. A file no plain `mod` chain reaches is not known to be outside every crate, so the roots are tried in their usual order, and `crate::Opts` in `src/unix.rs` binds `src/lib.rs` (owner root).

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

```rust path=src/sys.rs owner=root
#[path = "unix.rs"]
mod imp;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/unix.rs owner=unix
use crate::Opts;
```

## Expect

- src/sys.rs:2 -> node:unix   # the `mod` its `#[path]` attribute moves names the file the attribute gives
- src/unix.rs:1 -> node:root

## Why

Reading the roots alone cannot show that a file belongs to no crate: any file of the tree may place a module anywhere.
