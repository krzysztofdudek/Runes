---
id: rust-proc-macro-derive-through-facade-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Procedural macros, Derive macros (`#[proc_macro_derive(Name)]` defines the derive macro `Name` in the crate root); Use declarations (`pub use` re-exports a name from the module that writes it)"
---

## Rule

A facade crate re-exports the derive of its proc-macro crate: `kit/src/lib.rs` (node `facade`) has `pub use kit_derive::Builder;`. That line names the derive `Builder` of `kit-derive/src/lib.rs` (node `macros`) and binds it. `use kit::Builder;` in `app/src/lib.rs` names the facade's re-export and binds the facade's root file.

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

[dependencies]
kit-derive = { path = "../kit-derive" }
```

```toml path=kit-derive/Cargo.toml
[package]
name = "kit-derive"
edition = "2021"

[lib]
proc-macro = true
```

```rust path=kit-derive/src/lib.rs owner=macros
use proc_macro::TokenStream;
#[proc_macro_derive(Builder, attributes(builder))]
pub fn derive_builder(input: TokenStream) -> TokenStream { input }
```

```rust path=kit/src/lib.rs owner=facade
pub use kit_derive::Builder;
```

```rust path=app/src/lib.rs owner=root
use kit::Builder;
```

## Expect

- kit/src/lib.rs:1 -> node:macros      # the derive `Builder` of kit-derive/src/lib.rs
- app/src/lib.rs:1 -> node:facade      # the facade's `pub use … Builder`

## Why

The usual layout of a derive is a proc-macro crate behind a facade. The facade's dependency on its proc-macro crate is real and is carried by the re-export line.
