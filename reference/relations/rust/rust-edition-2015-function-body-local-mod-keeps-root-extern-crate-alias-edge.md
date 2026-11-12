---
id: rust-edition-2015-function-body-local-mod-keeps-root-extern-crate-alias-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference, Names, Name resolution (the items of a block come before the names of the enclosing module and the extern prelude); Rust Reference, Extern crate declarations (an extern crate in the crate root adds its name to the extern prelude)"
---

## Rule

In edition 2015 a `use` path starts at the crate root whatever a block declares. The crate root writes `extern crate engine_core as core2;`, and the `use core2::Engine;` in the body of `a` is read from the root, so it names the crate `engine-core` (node `engine`) though the body declares a module `core2` of its own (rustc 1.99.1 binds the extern crate here, and the local module from edition 2018 on). The same holds in the body of `b`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2015"

[dependencies]
engine-core = { path = "engine-core" }
```

```toml path=engine-core/Cargo.toml
[package]
name = "engine-core"
edition = "2015"
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
- src/lib.rs:6 -> node:engine   # `use core2::Engine;` in a body that declares a `core2`: edition 2015 reads it from the root
- src/lib.rs:9 -> node:engine   # `use core2::Engine;` in a body that declares none

## Why

The module a function body declares comes before the crate root's alias only from edition 2018 on; reading it first in edition 2015 dropped an edge that rustc gives.
