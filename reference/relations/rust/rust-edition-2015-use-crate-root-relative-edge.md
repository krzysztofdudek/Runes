---
id: rust-edition-2015-use-crate-root-relative-edge
language: rust
category: import
expectation: edge
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root; `extern crate` is needed for dependencies); The Cargo Book — the `edition` key (a manifest that gives none is edition 2015)"
---

## Rule

A package whose `[package]` gives no `edition` is edition 2015. There `use shapes::Circle;` is relative to the crate root, exactly as `use crate::shapes::Circle;` is: from `src/api/client.rs` it binds `src/shapes.rs` (node `src`), the module `shapes` that `src/lib.rs` declares with `mod shapes;`. The reserved crate `std` and a first segment the crate root does not declare stay external, so `use std::fmt::Debug;` and `use serde::Deserialize;` give nothing. A package that writes `edition = "2015"` reads the same.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
mod shapes;
```

```rust path=src/shapes.rs
pub struct Circle;
```

```rust path=src/api/client.rs
use shapes::Circle;
use std::fmt::Debug;
use serde::Deserialize;
```

## Expect

- src/api/client.rs:1 -> node:src    # edition 2015: `shapes::` is the crate root's module → src/shapes.rs

## Why

Treating the bare first segment as an external crate in every edition leaves every `use` of a 2015 crate, which is relative to its root, without an edge.
