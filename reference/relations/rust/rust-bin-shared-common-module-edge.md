---
id: rust-bin-shared-common-module-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs infer_subdirectory (a src/bin/<dir>/ is a target only with a main.rs); Rust Reference, Modules"
---

## Rule

`src/bin/app.rs` is a binary; `src/bin/common/` has no `main.rs`, so it is no target, only the module `common` that `app.rs` declares. In `src/bin/common/mod.rs`, `crate::config::Cfg` and `super::config::Cfg` both name the binary's `src/bin/config/mod.rs` (node config).

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=src/bin/app.rs
mod common;
mod config;
fn main() {}
```

```rust path=src/bin/config/mod.rs
pub struct Cfg;
```

```rust path=src/bin/common/mod.rs
use crate::config::Cfg;
use super::config::Cfg as C2;
```

## Expect

- src/bin/common/mod.rs:1 -> node:config
- src/bin/common/mod.rs:2 -> node:config
- src/bin/app.rs:1 -> node:common
- src/bin/app.rs:2 -> node:config
