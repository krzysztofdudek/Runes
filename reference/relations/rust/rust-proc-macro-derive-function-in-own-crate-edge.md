---
id: rust-proc-macro-derive-function-in-own-crate-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Procedural macros (a proc-macro crate exports only its macros; inside the crate the functions behind them are ordinary items)"
---

## Rule

Inside its own proc-macro crate the function that carries `#[proc_macro_derive(Builder)]` is an ordinary item of the crate root, named `builder`. `use crate::builder;` in the module `derive-kit/src/expand.rs` binds the root `derive-kit/src/lib.rs` (node `macros`).

## Files

```toml path=derive-kit/Cargo.toml
[package]
name = "derive-kit"
edition = "2021"

[lib]
proc-macro = true
```

```rust path=derive-kit/src/lib.rs owner=macros
use proc_macro::TokenStream;
mod expand;
#[proc_macro_derive(Builder)]
pub fn builder(input: TokenStream) -> TokenStream { input }
```

```rust path=derive-kit/src/expand.rs owner=expand
use crate::builder;
```

## Expect

- derive-kit/src/lib.rs:2 -> node:expand
- derive-kit/src/expand.rs:1 -> node:macros      # `fn builder` is an item of the crate root

## Why

The derive's name is one more item of the root, beside the function, not in place of it.
