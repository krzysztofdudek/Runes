---
id: rust-path-dependency-root-name-in-string-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Macros by example, path-based scope (`#[macro_export]` places the macro in the crate root namespace wherever it is defined); Tokens, String literals"
---

## Rule

`use kit::ensure;` names what the root of the path dependency `kit` binds as `ensure`: a `#[macro_export]` macro defined in `kit/src/macros/mod.rs`. The root file `kit/src/lib.rs` (node `kitroot`) has the words `fn ensure` only in a string literal, so it is not bound, and the `use` stays silent.

## Files

```toml path=app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { path = "../kit" }
```

```toml path=kit/Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=kit/src/lib.rs owner=kitroot
mod macros;
pub const HELP: &str = "call fn ensure first";
```

```rust path=kit/src/macros/mod.rs owner=kitroot
#[macro_export]
macro_rules! ensure {
    () => {};
}
```

```rust path=app/src/lib.rs
use kit::ensure;
```

## Expect

- silence      # kit/src/lib.rs names `ensure` only in a string → no edge to node:kitroot

## Why

The root file of a dependency is read the same way as the importing crate's own root: a word in a string is no item of it.
