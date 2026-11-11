---
id: rust-proc-macro-derive-name-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Procedural macros, Derive macros (`#[proc_macro_derive(Name)]` on a public function of the crate root defines the derive macro `Name`); The Cargo Book — Cargo targets, Library (`proc-macro = true`); Specifying dependencies, path dependencies"
---

## Rule

A derive macro is named by the first argument of `#[proc_macro_derive(…)]`, not by the function that carries the attribute. `derive-kit` is a proc-macro crate and a path dependency of `app`; its root `derive-kit/src/lib.rs` (node `macros`) has `#[proc_macro_derive(Builder)] pub fn builder(…)`, so `Builder` is an item of that root and `use derive_kit::Builder;` binds it.

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
#[proc_macro_derive(Builder)]
pub fn builder(input: TokenStream) -> TokenStream { input }
```

```rust path=app/src/lib.rs owner=root
use derive_kit::Builder;
```

## Expect

- app/src/lib.rs:1 -> node:macros      # `Builder` is the derive that derive-kit/src/lib.rs defines

## Why

Looking for an item whose own name is `Builder` finds none in the proc-macro crate, and the dependency of every crate that derives through it goes unseen.
