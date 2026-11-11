---
id: rust-module-of-main-chain-and-library-path-attribute-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate); Rust Reference, Modules (a `mod x;` names `x.rs` or `x/mod.rs` beside the declaring module)"
---

## Rule

`src/main.rs` declares `mod imp;` and `src/imp/mod.rs` declares `mod thing;`: a chain of plain `mod` declarations leads from the binary root down to `src/imp/thing.rs`, so the binary certainly compiles it. `src/lib.rs` reaches the same file through `#[path = "imp/thing.rs"] mod thing;`, which is not followed. The one root known to compile the file is tried first, and it holds an `Opts`, so `crate::Opts` binds `src/main.rs` (owner bin).

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

```rust path=src/imp/mod.rs owner=imp
mod thing;
```

```rust path=src/imp/thing.rs owner=thing
use crate::Opts;
```

## Expect

- src/main.rs:1 -> node:imp      # `mod imp;` in the binary root
- src/imp/mod.rs:1 -> node:thing  # `mod thing;` in the module
- src/imp/thing.rs:1 -> node:bin

## Why

The edge to the binary root is true in the crate that is known. The library root would be a guess here.
