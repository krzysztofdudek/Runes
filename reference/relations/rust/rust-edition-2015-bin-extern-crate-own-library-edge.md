---
id: rust-edition-2015-bin-extern-crate-own-library-edge
language: rust
category: import
expectation: edge
cites: "Rust Edition Guide, Path and module system changes (in edition 2015 a crate is in scope only through extern crate, and a use path is relative to the crate root)"
---

## Rule

Edition 2015 (the package gives none). The binary `src/main.rs` writes `extern crate app;`, which binds the package's own library at its root, so its `use app::Engine;` names the library `src/lib.rs`. The binary `src/bin/tool.rs` writes the same `use` without the declaration, under a `cfg` that never holds, where rustc does not resolve it: it names nothing, since that root binds no `app`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs owner=lib
pub struct Engine;
```

```rust path=src/main.rs owner=bin
extern crate app;
use app::Engine;
fn main() {
    let _ = Engine;
}
```

```rust path=src/bin/tool.rs owner=tool
#[cfg(any())]
use app::Engine;
fn main() {}
```

## Expect

- src/main.rs:1 -> node:lib   # `extern crate app;`
- src/main.rs:2 -> node:lib   # `use app::Engine;`, through the crate the root binds
# no edge from src/bin/tool.rs:2 (no root of that binary binds `app`)

## Why

In edition 2015 only `extern crate` brings a crate into the root, the package's own library included; without it the name is no crate.
