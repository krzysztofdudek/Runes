---
id: rust-edition-2015-use-crate-root-item-cfg-if-mod-edge
language: rust
category: import
expectation: edge
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name a module the crate root declares); the cfg-if crate documentation — macro cfg_if! (the items of the branch whose condition holds are items of the module that invokes it)"
---

## Rule

A `mod imp;` written in a branch of a `cfg_if!` invocation at the top level of `src/lib.rs` declares a module of the crate root (the module of every branch counts, since which condition holds is not known), also when the condition holds a string with a keyword in it (`feature = "impl"`), so in edition 2015 `use imp::Backend;` binds the module's file `src/imp/mod.rs` (node `imp`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
#[macro_use]
extern crate cfg_if;

cfg_if! {
    if #[cfg(feature = "impl")] {
        mod imp;
    } else {
        mod fallback;
    }
}
```

```rust path=src/imp/mod.rs
pub struct Backend;
```

```rust path=src/api/client.rs
use imp::Backend;
```

## Expect

- src/api/client.rs:1 -> node:imp    # `cfg_if!` declares the module `imp` at the top level of the crate root

## Why

`cfg_if!` is how crates pick a platform module, so a crate-root module declared only inside it is common; its branches hold items, while their conditions are text.
