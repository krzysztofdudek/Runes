---
id: rust-main-module-crate-item-lib-same-name-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate`); Cargo targets.rs inferred_bins"
---

## Rule

Package with both `src/lib.rs` and `src/main.rs`. `src/main.rs` declares `mod cli;` and has `struct Opts`; `src/lib.rs` also has a `struct Opts`. In the binary's module `src/cli/mod.rs`, `crate::Opts` is the binary root (owner bin), never the library root (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
pub struct Opts;
```

```rust path=src/main.rs owner=bin
mod cli;
struct Opts;
fn main() {}
```

```rust path=src/cli/mod.rs
use crate::Opts;
```

## Expect

- src/main.rs:1 -> node:cli
- src/cli/mod.rs:1 -> node:bin
