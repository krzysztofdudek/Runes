---
id: rust-module-written-by-macro-2-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Macros (a declarative macro 2.0 definition, `macro name(…) { … }`, expands at its call like `macro_rules!`); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` defines `macro decl($name:ident) { mod $name; }` and invokes it as `decl!(late);`, and `src/main.rs` is a second crate with an `Opts` of its own. The `mod late;` exists only through the expansion, which is not read, so no plain `mod` declaration leads from a root to `src/late/mod.rs`: the roots are tried in their usual order, and its `crate::Opts` binds `src/lib.rs` (owner root). `macro` is unstable, so the root enables `#![feature(decl_macro)]`: the case builds as a nightly compiler reads it.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#![feature(decl_macro)]
macro decl($name:ident) {
    mod $name;
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
