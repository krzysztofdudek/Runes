---
id: rust-edition-2015-use-crate-root-item-inline-mod-silence
language: rust
category: trap
expectation: silence
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root itself defines, not one defined inside a nested module or a function body)"
---

## Rule

In edition 2015 `use Error::NotFound;` names an item `Error` that the crate root defines at its top level. A name that exists only inside an inline `mod` of `src/lib.rs`, or inside a function body there, is not an item of the crate root, so the `use` binds nothing and stays silent.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
pub mod errors {
    pub enum Error {
        NotFound,
    }
}

pub fn build() {
    struct Local;
}
```

```rust path=src/api/client.rs
use Error::NotFound;
use Local;
```

## Expect

- silence      # `Error` lives in `mod errors` and `Local` in a function body: neither is an item of the crate root src/lib.rs

## Why

Matching a name anywhere in the root file's text reads an item nested in an inline module or a function as a top-level item of the root, and gives an edge from every file whose `use` happens to start with that name.