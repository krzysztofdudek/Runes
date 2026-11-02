---
id: rust-edition-2015-use-crate-root-item-edge
language: rust
category: import
expectation: edge
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root defines); The Cargo Book — the `edition` key (a manifest that gives none is edition 2015)"
---

## Rule

In edition 2015 `use Error;` and `use Error::NotFound;` are relative to the crate root, so they name the item `Error` that `src/lib.rs` itself defines, not a module file: from `src/api/client.rs` they bind `src/lib.rs` (node `src`). A name the root only brings in with `extern crate` is a crate, not an item of the root, so `use serde::Deserialize;` gives nothing, and neither does a name the root does not define.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
extern crate serde;

pub enum Error {
    NotFound,
}
```

```rust path=src/api/client.rs
use Error::NotFound;
use serde::Deserialize;
use Missing;
```

## Expect

- src/api/client.rs:1 -> node:src    # edition 2015: `Error` is an item of the crate root, src/lib.rs

## Why

Resolving only the modules the crate root declares leaves every `use` of a root-level item in a 2015 crate without an edge, although the path names that item exactly as `crate::Error` does.
