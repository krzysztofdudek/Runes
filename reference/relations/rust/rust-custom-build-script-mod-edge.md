---
id: rust-custom-build-script-mod-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs normalize_build (`build = \"<file>\"` names the build script); Rust Reference, Modules (a crate root's `mod x;` is beside it)"
---

## Rule

`[package] build = "build/main.rs"` makes `build/main.rs` the build script's crate root. Its `mod gen;` is `build/gen/mod.rs`, and `crate::gen::Table` the same file.

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"
build = "build/main.rs"
```

```rust path=src/lib.rs
pub fn f() {}
```

```rust path=build/main.rs
mod gen;
use crate::gen::Table;
fn main() {}
```

```rust path=build/gen/mod.rs
pub struct Table;
```

## Expect

- build/main.rs:1 -> node:gen
- build/main.rs:2 -> node:gen
