---
id: rust-edition-2018-use-local-module-over-crate-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Use declarations; Preludes, Extern prelude (a name in scope of the module is found before the crates of the extern prelude); rustc 1.x accepts the fixture and binds the local module"
---

## Rule

Edition 2021. The package has a path dependency `shapes`, and `src/lib.rs` declares a module of its own with that name. In `pub use shapes::Square;` the first segment is in scope as the local module, which Rust finds before the crate of the same name: the path binds `src/shapes/mod.rs` (node `local`), never the dependency `shapes/src/lib.rs` (node `dep`). `src/api/mod.rs` names its import of another module `shapes` too, and `use shapes::Square;` there follows that import to the same local module.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
shapes = { path = "shapes" }
```

```toml path=shapes/Cargo.toml
[package]
name = "shapes"
edition = "2021"
```

```rust path=shapes/src/lib.rs owner=dep
pub struct Circle;
```

```rust path=src/lib.rs owner=root
mod shapes;
pub use shapes::Square;
mod api;
```

```rust path=src/shapes/mod.rs owner=local
pub struct Square;
```

```rust path=src/api/mod.rs
use crate::shapes as shapes;
use shapes::Square;
```

## Expect

- src/lib.rs:1 -> node:local
- src/lib.rs:2 -> node:local      # the local module, not the crate `shapes`
- src/lib.rs:3 -> node:api
- src/api/mod.rs:1 -> node:local
- src/api/mod.rs:2 -> node:local  # the import of line 1, not the crate `shapes`

## Why

Looking the first segment up among the crates first points the edge at another package, though the compiler never reads it there.
