---
id: rust-edition-2018-use-leading-colons-crate-only-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Paths, Path qualifiers (`::`: from the 2018 edition a path that starts with `::` names a crate of the extern prelude); rustc 1.x binds the fixture's line 1 to the dependency and refuses line 2 with E0432"
---

## Rule

Edition 2021. The package has a path dependency `kit`, and the root declares modules of its own called `kit` and `shapes`. In `src/lib.rs`, `use ::kit::Order;` starts with `::`, so `kit` is the crate, never the module the same file declares: it binds `kit/src/lib.rs` (node `dep`). `use ::shapes::Circle;` names a crate `shapes`, which the package does not have; the root's module `shapes` is not what it means, so the line binds nothing.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { path = "kit" }
```

```toml path=kit/Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=kit/src/lib.rs owner=dep
pub struct Order;
```

```rust path=src/lib.rs owner=root
use ::kit::Order;
use ::shapes::Circle;
mod kit;
mod shapes;
```

```rust path=src/kit/mod.rs owner=localkit
pub struct Local;
```

```rust path=src/shapes/mod.rs
pub struct Circle;
```

## Expect

- src/lib.rs:1 -> node:dep           # `::kit` is the crate, though the file declares a module `kit`
- src/lib.rs:3 -> node:localkit
- src/lib.rs:4 -> node:shapes

## Why

Reading `::shapes` as the root's module, as edition 2015 does, would give line 2 an edge the compiler refuses, and reading `::kit` as the name in scope would point line 1 at the wrong package.
