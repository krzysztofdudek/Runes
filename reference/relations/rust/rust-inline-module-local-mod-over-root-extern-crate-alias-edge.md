---
id: rust-inline-module-local-mod-over-root-extern-crate-alias-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference, Names, Name resolution (from edition 2018 a use path's first segment is looked for in the module's own names before the extern prelude); Rust Reference, Extern crate declarations (an extern crate in the crate root adds its name to the extern prelude)"
---

## Rule

The crate root `src/lib.rs` writes `extern crate engine_core as core2;`, which puts `core2` in the extern prelude of every module of the crate, and its own `use core2::Engine;` names the crate `engine-core` (node `engine`). The inline module `inner` declares a module `core2` of its own, and a module's own names come before the extern prelude, so its `use core2::Engine;` names `inner::core2`, here the file `src/inner/core2.rs` (node `local`), never the crate. In the inline module `body`, `core2` is an inline module with a body, so its `use core2::Engine;` names an item of `src/lib.rs` itself and gives no edge.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
engine-core = { path = "engine-core" }
```

```toml path=engine-core/Cargo.toml
[package]
name = "engine-core"
edition = "2021"
```

```rust path=engine-core/src/lib.rs owner=engine
pub struct Engine;
```

```rust path=src/lib.rs owner=app
extern crate engine_core as core2;
use core2::Engine;
pub mod inner {
    pub mod core2;
    use core2::Engine;
    pub fn f() -> Engine {
        Engine
    }
}
pub mod body {
    pub mod core2 {
        pub struct Engine;
    }
    use core2::Engine;
    pub fn g() -> Engine {
        Engine
    }
}
pub fn h() -> Engine {
    Engine
}
```

```rust path=src/inner/core2.rs owner=local
pub struct Engine;
```

## Expect

- src/lib.rs:1 -> node:engine   # `extern crate engine_core as core2;`
- src/lib.rs:2 -> node:engine   # `use core2::Engine;` in the root
- src/lib.rs:4 -> node:local    # `pub mod core2;`
- src/lib.rs:5 -> node:local    # `use core2::Engine;` names `inner::core2`
# no edge from src/lib.rs:14 (`body::core2` is an inline module of the root file)

## Why

Reading the root's `extern crate` alias before the names of the module that writes the `use` binds a crate where rustc names a module of the crate itself.
