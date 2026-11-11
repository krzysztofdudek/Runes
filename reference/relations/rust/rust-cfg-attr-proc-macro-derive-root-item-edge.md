---
id: rust-cfg-attr-proc-macro-derive-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Procedural macros (a function with proc_macro_derive defines a derive macro at the crate root, named by the attribute's first argument); Rust Reference, Conditional compilation (cfg_attr applies its attributes when its predicate holds)"
---

## Rule

`kit` is a proc-macro crate whose function `name_derive` carries `#[cfg_attr(feature = "x", proc_macro_derive(Name))]`: where the feature is on, which `app` turns on (and the function is compiled only then), the function defines the derive macro `Name` at the crate root, as `#[proc_macro_derive(Name)]` written plainly does. So `use kit::Name;` in `app` names the root of `kit`, `kit/src/lib.rs` (node `kit`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { path = "kit", features = ["x"] }
```

```toml path=kit/Cargo.toml
[package]
name = "kit"
edition = "2021"

[lib]
proc-macro = true

[features]
x = []
```

```rust path=kit/src/lib.rs owner=kit
use proc_macro::TokenStream;

#[cfg(feature = "x")]
#[cfg_attr(feature = "x", proc_macro_derive(Name, attributes(name)))]
pub fn name_derive(_input: TokenStream) -> TokenStream {
    TokenStream::new()
}
```

```rust path=src/lib.rs owner=app
use kit::Name;

#[derive(Name)]
pub struct Order;
```

## Expect

- src/lib.rs:1 -> node:kit   # the derive `Name` is an item of the root of `kit`

## Why

Reading `proc_macro_derive` only where it is written as an attribute of its own leaves the derive a `cfg_attr` applies unknown, and `use kit::Name;` gives no edge.
