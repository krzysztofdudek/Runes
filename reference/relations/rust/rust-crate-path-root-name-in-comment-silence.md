---
id: rust-crate-path-root-name-in-comment-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Macros by example, path-based scope (`#[macro_export]` places the macro in the crate root namespace wherever it is defined); Comments"
---

## Rule

`use crate::ensure;` names a `#[macro_export]` macro defined in `src/macros/mod.rs`. The crate root file `src/lib.rs` (node `src`) declares nothing called `ensure`; the word stands only in a line comment, a block comment and a doc comment there. The root file is not bound and the `use` stays silent.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs
mod macros;
// ensure the API is stable: fn ensure
/* struct ensure; */
/// Use `fn ensure` first.
pub struct Unrelated;
```

```rust path=src/macros/mod.rs owner=src
#[macro_export]
macro_rules! ensure {
    () => {};
}
```

```rust path=src/api/mod.rs
use crate::ensure;
```

## Expect

- silence      # src/lib.rs names `ensure` only in comments → no edge to node:src

## Why

A comment is no declaration. The root file is bound for a name only when its top level binds that name as an item.
