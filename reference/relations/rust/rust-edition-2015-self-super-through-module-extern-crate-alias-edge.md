---
id: rust-edition-2015-self-super-through-module-extern-crate-alias-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Extern crate declarations (the declaration binds its name in the module that writes it, as an item of that module); Rust Reference, Paths (self names the current module, super its parent)"
---

## Rule

Edition 2015 (the package gives none). The module `net`, `src/net/mod.rs`, writes `extern crate util as u;`, which binds `u` among the names of `net`. So `use self::u::Marker;` there, and `use super::u::Marker;` in its child module `src/net/child.rs`, go through that name to the crate `util`, the path dependency `util` (node `util`). No file `u.rs` is looked for.

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

```rust path=util/src/lib.rs owner=util
pub struct Marker;
```

```rust path=src/lib.rs owner=app
pub mod net;
```

```rust path=src/net/mod.rs owner=net
extern crate util as u;
use self::u::Marker;
pub mod child;
pub fn mark() -> Marker {
    Marker
}
```

```rust path=src/net/child.rs owner=child
use super::u::Marker;
pub fn again() -> Marker {
    Marker
}
```

## Expect

- src/lib.rs:1 -> node:net
- src/net/mod.rs:1 -> node:util     # `extern crate util as u;`
- src/net/mod.rs:2 -> node:util     # `self::u` is the crate `util`
- src/net/mod.rs:3 -> node:child
- src/net/child.rs:1 -> node:util   # `super::u` is the same name of `net`

## Why

Reading `self::u` and `super::u` only as module files of that name loses the edge to the crate the name stands for.
