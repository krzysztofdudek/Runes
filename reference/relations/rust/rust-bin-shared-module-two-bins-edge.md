---
id: rust-bin-shared-module-two-bins-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs infer_subdirectory (a src/bin/<dir>/ is a target only with a main.rs); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/bin/common/` has no `main.rs`, so it is a module, here of both binaries `src/bin/one.rs` and `src/bin/two.rs`, which each declare `mod common;`. Its `crate::config::Cfg` names the root of whichever binary compiles it, which cannot be told, so it gives no edge. `src/bin/loose/mod.rs` is declared by no binary: no crate compiles it, so its `crate::config::Cfg` gives no edge either.

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=src/bin/one.rs
mod common;
mod config;
fn main() {}
```

```rust path=src/bin/two.rs
mod common;
mod config;
fn main() {}
```

```rust path=src/bin/config/mod.rs
pub struct Cfg;
```

```rust path=src/bin/common/mod.rs
use crate::config::Cfg;
```

```rust path=src/bin/loose/mod.rs
use crate::config::Cfg;
```

## Expect

- src/bin/one.rs:1 -> node:common   # `mod common;`
- src/bin/one.rs:2 -> node:config   # `mod config;`
- src/bin/two.rs:1 -> node:common
- src/bin/two.rs:2 -> node:config
# no edge from src/bin/common/mod.rs:1 (two binaries declare the module) and none from src/bin/loose/mod.rs:1 (no binary does)

## Why

Reading such a directory as a crate of its own, or as a module of one binary chosen by chance, puts an edge on a root the file may not belong to.
