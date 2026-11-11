---
id: rust-bin-path-in-src-module-root-item-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs target_path (a [[bin]] path is its root); Rust Reference, Paths (`crate`)"
---

## Rule

`[[bin]] name = "cli" path = "src/cli.rs"`, with `autobins = false` so `src/main.rs` is absent and the library `src/lib.rs` exists. `src/args/mod.rs` is a module the binary declares. `crate::Opts` there binds the binary root `src/cli.rs` (owner cli), never the library's `src/lib.rs` (owner lib), which has an `Opts` too.

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"

[[bin]]
name = "cli"
path = "src/cli.rs"
```

```rust path=src/lib.rs owner=lib
pub struct Opts;
```

```rust path=src/cli.rs owner=cli
mod args;
pub struct Opts;
fn main() {}
```

```rust path=src/args/mod.rs
use crate::Opts;
```

## Expect

- src/args/mod.rs:1 -> node:cli
- src/cli.rs:1 -> node:args
