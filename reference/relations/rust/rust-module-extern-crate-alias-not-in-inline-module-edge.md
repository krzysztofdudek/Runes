---
id: rust-module-extern-crate-alias-not-in-inline-module-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Extern crate declarations (the name is bound in the module that writes the declaration); Preludes, Extern prelude (only an `extern crate` in the crate root adds its name to the extern prelude)"
---

## Rule

Edition 2021. `extern crate engine_core as core2;` stands at the top of the module file `src/api.rs`, which is not the crate root, so `core2` is a name of the module `api` alone. The inline module `inner` in the same file is another module: its `use core2::Engine;` names its own `mod core2`, and gives no edge. Only the declaration line binds the path dependency `engine-core/src/lib.rs` (node `dep`).

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

```rust path=engine-core/src/lib.rs owner=dep
pub struct Engine;
```

```rust path=src/lib.rs owner=root
mod api;
```

```rust path=src/api.rs owner=api
extern crate engine_core as core2;
mod inner {
    mod core2 {
        pub struct Engine;
    }
    use core2::Engine;
}
```

## Expect

- src/lib.rs:1 -> node:api
- src/api.rs:1 -> node:dep      # the declaration names the crate engine_core; line 6 names `inner`'s own module

## Why

A name bound in a file's module is not bound in the inline modules of that file. Keeping the alias per file gives an edge for a path that stays inside the file.
