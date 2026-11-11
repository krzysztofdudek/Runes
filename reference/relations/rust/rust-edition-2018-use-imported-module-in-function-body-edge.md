---
id: rust-edition-2018-use-imported-module-in-function-body-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference — Use declarations; Names, Scopes (a `use` inside a function body sees the names of the module around it; a child module does not see them by a bare name)"
---

## Rule

Edition 2021. `src/api/mod.rs` writes `use crate::shapes as sh;` at its top level. Inside the body of `f`, `use sh::round::Arc;` starts with that name and binds `src/shapes/round/mod.rs` (node `round`). The inline module `inner` is another module: `sh` is no name of it, so its `use sh::round::Arc;` is read as a path into a crate called `sh` and binds nothing.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=api
mod shapes;
mod api;
```

```rust path=src/shapes/mod.rs
pub mod round;
```

```rust path=src/shapes/round/mod.rs
pub struct Arc;
```

```rust path=src/api/mod.rs
use crate::shapes as sh;
pub fn f() {
    use sh::round::Arc;
    let _ = Arc;
}
mod inner {
    use sh::round::Arc;
}
```

## Expect

- src/lib.rs:1 -> node:shapes
- src/shapes/mod.rs:1 -> node:round
- src/api/mod.rs:1 -> node:shapes
- src/api/mod.rs:3 -> node:round      # inside the function body the module's own names are in scope

## Why

A name is looked up outward through the blocks around the `use` and stops at the module: taking it for a name of every module of the file would bind line 7, which Rust refuses.
