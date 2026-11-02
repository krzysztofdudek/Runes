---
id: rust-bin-edition-2015-in-2018-package-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Cargo Targets, the `edition` field of a target (it overrides the package's edition for that target); The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root)"
---

## Rule

A `[[bin]]` table can set its own `edition`, which then decides how the files of that binary read their paths, whatever `[package].edition` says. Here the package is edition 2018 and its only binary is edition 2015: from `src/api/client.rs`, a file under the binary's `src/`, `use shapes::Circle;` is relative to the crate root and binds `src/shapes.rs` (node `src`), the module `shapes` that `src/main.rs` declares.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2018"

[[bin]]
name = "app"
path = "src/main.rs"
edition = "2015"
```

```rust path=src/main.rs
mod shapes;
```

```rust path=src/shapes.rs
pub struct Circle;
```

```rust path=src/api/client.rs
use shapes::Circle;
```

## Expect

- src/api/client.rs:1 -> node:src    # the bin is edition 2015: `shapes::` is the crate root's module → src/shapes.rs

## Why

Reading only `[package].edition` takes the bin for edition 2018, where the same path names an external crate, and loses the edge of every older binary in a newer package.
