---
id: rust-function-body-local-mod-over-root-extern-crate-alias-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference, Names, Name resolution (the items of a block come before the names of the enclosing module and the extern prelude); Rust Reference, Extern crate declarations (an extern crate in the crate root adds its name to the extern prelude)"
---

## Rule

The crate root writes `extern crate engine_core as core2;`, which puts `core2` in the extern prelude, and its own `use core2::Engine;` names the crate `engine-core` (node `engine`). The function `a` declares a module `core2` in its body, and the items of a block come before the extern prelude, so the `use core2::Engine;` in the same body names that module and gives no edge. The function `b`, whose body declares no such module, still names the crate.

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
pub fn a() {
    mod core2 {
        pub struct Engine;
    }
    use core2::Engine;
}
pub fn b() -> usize {
    use core2::Engine;
    0
}
```

## Expect

- src/lib.rs:1 -> node:engine   # `extern crate engine_core as core2;`
- src/lib.rs:9 -> node:engine   # `use core2::Engine;` in a body that declares no `core2`
# no edge from src/lib.rs:6 (`core2` is a module of the body of `a`)

## Why

The module a function body declares was not counted among the names that come before the crate root's `extern crate` alias, so the `use` in that body bound the other package where rustc binds the local module.
