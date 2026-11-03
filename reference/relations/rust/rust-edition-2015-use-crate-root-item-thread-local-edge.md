---
id: rust-edition-2015-use-crate-root-item-thread-local-edge
language: rust
category: import
expectation: edge
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root defines); The Rust standard library — macro std::thread_local (each `static` it is given becomes an item of the module that invokes it)"
---

## Rule

A `thread_local!` invocation at the top level of `src/lib.rs` defines each `static` it is given as an item of the crate root, so in edition 2015 `use COUNTER;` binds `src/lib.rs` (node `src`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
use std::cell::Cell;

thread_local! {
    pub static COUNTER: Cell<u32> = Cell::new(0);
}
```

```rust path=src/api/client.rs
use COUNTER;
```

## Expect

- src/api/client.rs:1 -> node:src    # `thread_local!` defines `COUNTER` at the top level of the crate root

## Why

The parse tree holds a macro's body as tokens, so an item the macro defines is found only by reading the tokens of a macro whose expansion is known.
