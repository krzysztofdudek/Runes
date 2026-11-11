---
id: rust-module-with-path-attribute-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Modules (the `path` attribute names the file of a module); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` declares `#[path = "imp/thing.rs"] mod thing;`, and `src/main.rs` is a second crate with an `Opts` of its own. The module's file lies under a name the reader cannot match to a declaration, so which root owns `src/imp/thing.rs` is left to the first root, and `crate::Opts` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[path = "imp/thing.rs"]
mod thing;
pub struct Opts;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/imp/thing.rs
use crate::Opts;
```

## Expect

- src/imp/thing.rs:1 -> node:root
