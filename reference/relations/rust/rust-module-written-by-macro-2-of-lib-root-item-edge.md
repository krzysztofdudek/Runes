---
id: rust-module-written-by-macro-2-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Macros (a declarative macro 2.0 definition, `macro name(…) { … }`, expands at its call like `macro_rules!`); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` defines `macro decl($name:ident) { mod $name; }` and invokes it as `decl!(late);`, and `src/main.rs` is a second crate with an `Opts` of its own. A macro definition of that form can write a `mod` the reader does not see, so the root cannot be read to the end: the module is left to the first root and `crate::Opts` in `src/late/mod.rs` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
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
