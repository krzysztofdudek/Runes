---
id: rust-edition-2015-use-crate-root-item-extern-block-edge
language: rust
category: import
expectation: edge
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root defines); The Rust Reference — External blocks (the functions and statics an `extern` block declares are items of the module that holds the block)"
---

## Rule

The function and the static an `extern "C"` block of `src/lib.rs` declares are items of the crate root, also when a `#[cfg]` attribute on the block holds a string with a keyword in it (`feature = "fn"`), so in edition 2015 `use compress;` and `use VERSION;` bind `src/lib.rs` (node `src`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
#[cfg(not(feature = "fn"))]
extern "C" {
    pub fn compress();
    pub static VERSION: u32;
}
```

```rust path=src/api/client.rs
use compress;
use VERSION;
```

## Expect

- src/api/client.rs:1 -> node:src    # `compress` is declared by the extern block at the top level of the crate root
- src/api/client.rs:2 -> node:src    # so is the static `VERSION`

## Why

An `extern` block's braces hold items of the module around it, not a body, and a keyword inside a string of an attribute is text: reading either the other way loses the items of a binding crate's root.
