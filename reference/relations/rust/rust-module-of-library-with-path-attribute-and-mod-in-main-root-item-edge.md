---
id: rust-module-of-library-with-path-attribute-and-mod-in-main-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Modules (the `path` attribute names the file of a module); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` declares `#[path = "imp/thing.rs"] mod thing;` and `src/main.rs` declares `mod imp;`. Rust compiles `src/imp/thing.rs` into the library. The binary declares a module called `imp`, but `src/imp/mod.rs` does not declare `thing`, so no chain of plain `mod` declarations leads from the binary root to the file. The name `imp` alone does not pick the binary: the roots are tried in their usual order, and `crate::Opts` in `src/imp/thing.rs` binds `src/lib.rs` (owner root), not `src/main.rs` (owner bin).

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
mod imp;
struct Opts;
fn main() {}
```

```rust path=src/imp/mod.rs
```

```rust path=src/imp/thing.rs
use crate::Opts;
```

## Expect

- src/main.rs:1 -> node:imp
- src/imp/thing.rs:1 -> node:root
