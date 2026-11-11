---
id: rust-edition-2015-bin-own-crate-name-without-extern-crate-root-module-edge
language: rust
category: trap
expectation: edge
cites: "Rust Edition Guide, Path and module system changes (in edition 2015 a use path is relative to the crate root, and a crate is in scope only through extern crate)"
---

## Rule

Edition 2015 (the package gives none). The package `app` has a library and a binary. In edition 2015 a `use` path starts at the crate root, and the package's own library is in scope there only through `extern crate app;`, which `src/main.rs` does not write. Its `use app::Engine;` therefore names the binary's own module `app`, `src/app.rs` (node `local`), and never the library `src/lib.rs` (node `lib`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs owner=lib
pub struct Engine;
```

```rust path=src/main.rs owner=bin
mod app;
use app::Engine;
fn main() {
    let _ = Engine;
}
```

```rust path=src/app.rs owner=local
pub struct Engine;
```

## Expect

- src/main.rs:1 -> node:local   # `mod app;`
- src/main.rs:2 -> node:local   # `use app::Engine;`, the root's module

## Why

Reading the package's own name as its library before the crate root's names puts an edge on a crate rustc never reaches from that path.
