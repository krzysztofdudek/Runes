---
id: rust-module-extern-crate-alias-use-in-function-body-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Extern crate declarations (the declaration binds its name in the module or block that writes it); Rust Reference, Names, Scopes (a block sees the items of the modules around it, up to the nearest module)"
---

## Rule

`src/run.rs` writes `extern crate engine_core as core2;`, which binds `core2` in its module, and a function body or a block of that module sees the names of its module. So `use core2::Engine;` in the body of `go`, and the same in a block nested in `stop`, name the crate `engine_core`, the path dependency `engine-core` (node `engine`). The inline module `other` is a module of its own, where `core2` is not bound, so its `use core2::Only;` names the inner module `core2`, which alone defines `Only`, and gives no edge to the crate.

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
pub mod run;
```

```rust path=src/run.rs owner=run
extern crate engine_core as core2;
pub fn go() {
    use core2::Engine;
    let _ = Engine;
}
pub fn stop() {
    {
        use core2::Engine;
        let _ = Engine;
    }
}
pub mod other {
    pub mod core2 {
        pub struct Only;
    }
    pub fn here() {
        use core2::Only;
        let _ = Only;
    }
}
```

## Expect

- src/lib.rs:1 -> node:run
- src/run.rs:1 -> node:engine    # `extern crate engine_core as core2;`
- src/run.rs:3 -> node:engine    # in the body of `go`
- src/run.rs:8 -> node:engine    # in a block of `stop`
# no edge from src/run.rs:17 (`core2` there is the inline module `other::core2`)

## Why

Reading the declaration as binding only the `use` declarations written beside it loses the edge from every function body of the module.
