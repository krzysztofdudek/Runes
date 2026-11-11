---
id: rust-bin-shared-module-two-bins-super-sibling-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs infer_subdirectory (a src/bin/<dir>/ is a target only with a main.rs); Rust Reference, Paths (`super` is the parent module, `crate` the root of the current crate)"
---

## Rule

`src/bin/common/` has no `main.rs`, so it is a module of both binaries `src/bin/a.rs` and `src/bin/b.rs`, which each declare `mod common;`. In `src/bin/common/x.rs`, `super::y::T` names the sibling module `src/bin/common/y.rs` (node `sibling`) in either binary, so it gives its edge; `crate::config::Cfg` names the root of whichever binary compiles the file, which cannot be told, so it gives none.

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=src/bin/a.rs
mod common;
mod config;
fn main() {}
```

```rust path=src/bin/b.rs
mod common;
mod config;
fn main() {}
```

```rust path=src/bin/config/mod.rs
pub struct Cfg;
```

```rust path=src/bin/common/mod.rs
mod x;
mod y;
```

```rust path=src/bin/common/x.rs
use super::y::T;
use crate::config::Cfg;
```

```rust path=src/bin/common/y.rs owner=sibling
pub struct T;
```

## Expect

- src/bin/a.rs:1 -> node:common
- src/bin/a.rs:2 -> node:config
- src/bin/b.rs:1 -> node:common
- src/bin/b.rs:2 -> node:config
- src/bin/common/mod.rs:2 -> node:sibling
- src/bin/common/x.rs:1 -> node:sibling
