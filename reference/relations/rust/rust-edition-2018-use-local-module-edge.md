---
id: rust-edition-2018-use-local-module-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Use declarations (from edition 2018 a `use` path may start with a name in scope of the module that writes it, such as a module it declares)"
---

## Rule

Edition 2021. `src/lib.rs` declares `mod shapes;` and then writes `pub use shapes::Circle;`. The path starts with the name `shapes`, which is in scope in that module as the module it declares, so it names `src/shapes/mod.rs` (node `shapes`). Both lines bind it.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs
mod shapes;
pub use shapes::Circle;
```

```rust path=src/shapes/mod.rs
pub struct Circle;
```

## Expect

- src/lib.rs:1 -> node:shapes
- src/lib.rs:2 -> node:shapes      # `shapes` is the module this file declares

## Why

Reading every bare first segment as an external crate loses the line, and where the path goes deeper than the module itself, the only edge to the file it names.
