---
id: rust-proc-macro-derive-helper-attribute-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Procedural macros, Derive macros and Derive macro helper attributes (the names in `attributes(…)` are inert attributes in scope only on the item that derives; a proc-macro crate exports nothing but its macros)"
---

## Rule

`#[proc_macro_derive(Builder, attributes(setter, skip))]` defines one item of the crate root, the derive `Builder`. The helper attributes `setter` and `skip` are no items and cannot be imported, and neither can the function `derive_builder` that carries the attribute: a proc-macro crate exports only its macros. None of the three `use` lines binds `derive-kit/src/lib.rs` (node `macros`).

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
use derive_kit::setter;
use derive_kit::skip;
use derive_kit::derive_builder;
```

## Expect

- silence      # `setter` and `skip` are helper attributes and `derive_builder` is the function behind the derive: none is an item of the proc-macro crate's root

## Why

Taking every name inside the attribute for an item would bind paths that name nothing.
