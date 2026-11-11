---
id: rust-module-of-library-with-path-attribute-and-mod-in-main-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Modules (the `path` attribute names the file of a module); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` declares `#[path = "imp/thing.rs"] mod thing;` and `src/main.rs` declares `mod imp;`. Rust compiles `src/imp/thing.rs` into the library, but the reader sees only the binary declare a module called `imp`. A package with a root that cannot be read to the end leaves every module to the first root, so the name `imp` does not pick the binary: `crate::Opts` in `src/imp/thing.rs` binds `src/lib.rs` (owner root), not `src/main.rs` (owner bin).

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
