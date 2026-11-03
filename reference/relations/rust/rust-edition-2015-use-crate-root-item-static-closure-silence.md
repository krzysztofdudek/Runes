---
id: rust-edition-2015-use-crate-root-item-static-closure-silence
language: rust
category: trap
expectation: silence
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root itself defines); The Rust Reference — Closure expressions and Block expressions (an item declared in a closure's body is in scope only inside it)"
---

## Rule

A struct declared in the body of a closure that a `static` of `src/lib.rs` passes to `Lazy::new` is local to that body, not an item of the crate root, so in edition 2015 `use Error;` binds nothing and stays silent.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
extern crate once_cell;

use once_cell::sync::Lazy;

pub static TABLE: Lazy<u8> = Lazy::new(|| {
    struct Error;
    0
});
```

```rust path=src/api/client.rs
use Error;
```

## Expect

- silence      # `Error` lives in the closure body of the `static TABLE` initializer

## Why

A lazily initialized `static` is the common way old crates build a table once, and reading the closure's braces as the root's top level takes its local struct for an item of the crate root.
