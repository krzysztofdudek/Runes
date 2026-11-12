---
id: rust-bin-dir-with-main-stays-crate-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs infer_subdirectory (a src/bin/<dir>/ with a main.rs is a binary target of its own); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/bin/tool/` holds a `main.rs`, so it is a crate of its own, rooted at `src/bin/tool/main.rs`. In `src/bin/tool/args/mod.rs`, `crate::config::Cfg` names the module its own root declares, `src/bin/tool/config/mod.rs` (node `config`, under the tool), never the module `src/bin/config/mod.rs` that the binary `src/bin/app.rs` declares (node `bin`).

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=src/bin/app.rs
mod config;
fn main() {}
```

```rust path=src/bin/config.rs owner=bin
pub struct Cfg;
fn main() {}
```

```rust path=src/bin/tool/main.rs
mod args;
mod config;
fn main() {}
```

```rust path=src/bin/tool/config/mod.rs owner=config
pub struct Cfg;
```

```rust path=src/bin/tool/args/mod.rs
use crate::config::Cfg;
```

## Expect

- src/bin/tool/args/mod.rs:1 -> node:config
- src/bin/tool/main.rs:1 -> node:args
- src/bin/tool/main.rs:2 -> node:config
