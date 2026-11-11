---
id: rust-edition-2018-use-imported-module-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Use declarations (from edition 2018 a `use` path may start with a name another `use` of the same module brought into scope)"
---

## Rule

Edition 2021. `src/api/client.rs` writes `use crate::shapes;` and then `use shapes::Circle;`: the second path starts with the name the first one bound, the module `src/shapes/mod.rs` (node `shapes`). `src/api/other.rs` writes `use crate::shapes;` and then `use shapes::round::Arc;`, which goes on into `src/shapes/round/mod.rs` (node `round`): that line is the only edge to it.

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
pub struct Circle;
```

```rust path=src/shapes/round/mod.rs
pub struct Arc;
```

```rust path=src/api/mod.rs
mod client;
mod other;
```

```rust path=src/api/client.rs
use crate::shapes;
use shapes::Circle;
```

```rust path=src/api/other.rs
use crate::shapes;
use shapes::round::Arc;
```

## Expect

- src/lib.rs:1 -> node:shapes
- src/shapes/mod.rs:1 -> node:round
- src/api/client.rs:1 -> node:shapes
- src/api/client.rs:2 -> node:shapes      # `shapes` is what line 1 imported
- src/api/other.rs:1 -> node:shapes
- src/api/other.rs:2 -> node:round        # the only edge from this file to node:round

## Why

The name a `use` brings in is a name of its module like any other, and a later path may start with it.
