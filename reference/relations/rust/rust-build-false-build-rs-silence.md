---
id: rust-build-false-build-rs-silence
language: rust
category: import
expectation: silence
cites: "Cargo targets.rs normalize_build (`build = false` turns the build script off, whatever build.rs holds)"
---

## Rule

`[package] build = false` makes the `build.rs` at the package root an ordinary stray file, not a build script. Its `mod gen;` and `crate::gen::Table` are not those of a crate rooted there, so `gen.rs` beside it is not bound.

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"
build = false
```

```rust path=src/lib.rs
pub fn f() {}
```

```rust path=build.rs
mod gen;
use crate::gen::Table;
fn main() {}
```

```rust path=gen.rs owner=gen
pub struct Table;
```

## Expect

- silence
