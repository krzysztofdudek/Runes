---
id: rust-edition-2015-use-crate-root-item-use-in-const-block-silence
language: rust
category: trap
expectation: silence
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root brings into scope); The Rust Reference — Use declarations and Block expressions (a `use` in a block brings its name into that block only)"
---

## Rule

A `use` written inside the initializer block of a `const _` of `src/lib.rs` brings `Error` into that block only, not into the crate root module, so in edition 2015 `use Error;` from another file binds nothing and stays silent.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
const _: () = {
    use std::io::Error;
};
```

```rust path=src/api/client.rs
use Error;
```

## Expect

- silence      # the `use` that names `Error` sits in a block, so the crate root module holds no `Error`

## Why

A `use` statement is found by its keyword anywhere in a file's text; only its place in the tree says whether it imports into the crate root or into a block.
