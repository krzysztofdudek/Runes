---
id: rust-edition-2015-use-crate-root-item-macro-rules-body-silence
language: rust
category: trap
expectation: silence
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root itself defines); The Rust Reference — Macros By Example (a transcriber is expanded where the macro is invoked, not where it is defined)"
---

## Rule

A struct written in the transcriber of a `macro_rules!` of `src/lib.rs` is defined only where the macro is invoked, and the root never invokes it, so it is no item of the crate root: in edition 2015 `use Error;` binds nothing and stays silent. The macro's own name is an item of the root.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
macro_rules! make_error {
    () => {
        pub struct Error;
    };
}
```

```rust path=src/api/client.rs
use Error;
```

## Expect

- silence      # `Error` is text of the macro's transcriber, not an item src/lib.rs defines

## Why

The braces of a `macro_rules!` body hold tokens, not items; read as the root's top level they invent an item the crate root never has.
