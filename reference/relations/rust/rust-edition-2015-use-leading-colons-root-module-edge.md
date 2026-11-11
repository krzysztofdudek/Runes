---
id: rust-edition-2015-use-leading-colons-root-module-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Paths, Path qualifiers (`::`: in the 2015 edition a path that starts with `::` is relative to the crate root)"
---

## Rule

Edition 2015. The root declares `mod util;` and `mod shapes;`, writes `extern crate engine_core as core2;`, and the package has a path dependency `util`. In modules of `api`: `use util::slug;` names the root's module, `use ::shapes::Circle;` starts with `::` and so at the crate root, where `shapes` is the root's module (`src/shapes/mod.rs`, node `shapes`), and `use core2::Engine;` names the dependency.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[dependencies]
util = { path = "util" }
engine-core = { path = "engine-core" }
```

```toml path=util/Cargo.toml
[package]
name = "util"
```

```rust path=util/src/lib.rs owner=depsrc
pub fn slug() {}
```

```toml path=engine-core/Cargo.toml
[package]
name = "engine-core"
```

```rust path=engine-core/src/lib.rs owner=dep
pub struct Engine;
```

```rust path=src/lib.rs owner=api
extern crate engine_core as core2;
mod util;
mod shapes;
mod api;
```

```rust path=src/util/mod.rs owner=localutil
pub fn slug() {}
```

```rust path=src/shapes/mod.rs
pub struct Circle;
```

```rust path=src/api/mod.rs
mod a;
mod b;
mod c;
```

```rust path=src/api/a.rs
use util::slug;
```

```rust path=src/api/b.rs
use ::shapes::Circle;
use ::shapes::{self, Circle as C};
use ::shapes::*;
```

```rust path=src/api/c.rs
use core2::Engine;
```

## Expect

- src/lib.rs:1 -> node:dep
- src/lib.rs:2 -> node:localutil
- src/lib.rs:3 -> node:shapes
- src/api/a.rs:1 -> node:localutil
- src/api/b.rs:1 -> node:shapes      # `::` is the crate root in edition 2015
- src/api/b.rs:2 -> node:shapes
- src/api/b.rs:3 -> node:shapes
- src/api/c.rs:1 -> node:dep
