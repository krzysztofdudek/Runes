---
id: rust-proc-macro-derive-helper-attribute-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Procedural macros, Derive macros and Derive macro helper attributes (the names in `attributes(…)` are inert attributes in scope only on the item that derives)"
---

## Rule

`#[proc_macro_derive(Builder, attributes(setter, skip))]` gives the crate root one more item, the derive `Builder`. The helper attributes `setter` and `skip` are no items and cannot be imported. Neither `use` line binds `derive-kit/src/lib.rs` (node `macros`). rustc refuses both imports, so they stand in `app/src/builders.rs`, a file no `mod` declares, which the crate does not compile, beside the crate root `app/src/lib.rs`.

## Files

```toml path=app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
derive-kit = { path = "../derive-kit" }
```

```toml path=derive-kit/Cargo.toml
[package]
name = "derive-kit"
edition = "2021"

[lib]
proc-macro = true
```

```rust path=derive-kit/src/lib.rs owner=macros
use proc_macro::TokenStream;
#[proc_macro_derive(Builder, attributes(setter, skip))]
pub fn derive_builder(input: TokenStream) -> TokenStream { input }
```

```rust path=app/src/lib.rs owner=root
pub struct App;
```

```rust path=app/src/builders.rs owner=root
use derive_kit::setter;
use derive_kit::skip;
```

## Expect

- silence      # `setter` and `skip` are helper attributes, no items of the proc-macro crate's root

## Why

Taking every name inside the attribute for an item would bind paths that name nothing. A file in the middle of an edit can hold such a path, and it still gets no edge.
