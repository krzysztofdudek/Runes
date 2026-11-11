---
id: rust-edition-2015-root-extern-crate-path-dependency-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Extern crate declarations; Preludes, Extern prelude (in the 2015 edition a crate is referenced from a `use` through the name an `extern crate` in the crate root binds)"
---

## Rule

Edition 2015. The crate root `src/lib.rs` writes `#[macro_use] extern crate util;`, which binds the path dependency `util` as a name of the crate root. `use util::slug;` in `src/api/a.rs` is relative to the crate root and binds the dependency's root `util/src/lib.rs` (node `depsrc`). In `src/tools/mod.rs` an `extern crate util;` of the module's own binds the dependency on its declaration line.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[dependencies]
util = { path = "util" }
```

```toml path=util/Cargo.toml
[package]
name = "util"
```

```rust path=util/src/lib.rs owner=depsrc
pub fn slug() {}
```

```rust path=src/lib.rs owner=root
#[macro_use]
extern crate util;
```

```rust path=src/api/a.rs
use util::slug;
```

```rust path=src/tools/mod.rs
mod inner {
    extern crate util;
}
```

## Expect

- src/lib.rs:2 -> node:depsrc         # the declaration names the crate util
- src/api/a.rs:1 -> node:depsrc       # `util` is the root's name for the dependency
- src/tools/mod.rs:2 -> node:depsrc   # an `extern crate` names its crate wherever it stands

## Why

This is how every edition 2015 crate reaches its dependencies, so the edge must hold whenever the root writes the declaration.
