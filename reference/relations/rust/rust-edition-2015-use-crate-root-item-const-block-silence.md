---
id: rust-edition-2015-use-crate-root-item-const-block-silence
language: rust
category: trap
expectation: silence
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root itself defines); The Rust Reference — Block expressions (an item declared in a block is in scope only inside that block)"
---

## Rule

A struct declared inside the block that initializes an unnamed `const _` of `src/lib.rs` is local to that block, not an item of the crate root, so in edition 2015 `use Error;` binds nothing and stays silent.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
const _: () = {
    struct Error;
};
```

```rust path=src/api/client.rs
use Error;
```

## Expect

- silence      # `Error` lives in the initializer block of `const _`, which no `use` path from the crate root reaches

## Why

Reading the braces of an initializer as the root's top level takes a block-local struct for an item of the crate root and gives an edge from every file whose `use` names it.
