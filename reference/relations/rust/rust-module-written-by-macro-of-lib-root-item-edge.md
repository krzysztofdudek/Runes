---
id: rust-module-written-by-macro-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Macros By Example (a `macro_rules!` expansion at the crate root can write a `mod` item); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` defines a `macro_rules!` macro whose body writes `mod $name;` and invokes it as `decl!(late);`, and `src/main.rs` is a second crate with an `Opts` of its own. The module `late` exists only through the expansion, which the reader does not follow, so its owner is left to the first root and `crate::Opts` in `src/late/mod.rs` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
macro_rules! decl {
    ($name:ident) => {
        mod $name;
    };
}
decl!(late);
pub struct Opts;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/late/mod.rs
use crate::Opts;
```

## Expect

- src/late/mod.rs:1 -> node:root
