---
id: rust-edition-2015-main-module-over-library-extern-crate-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Preludes, Extern prelude (in the 2015 edition a crate is referenced from a `use` through the name an `extern crate` in the crate root binds); The Cargo Book — Cargo targets (`src/lib.rs` and `src/main.rs` are the roots of two crates)"
---

## Rule

Edition 2015. The package has a library and a binary over one `src/`. The library's root `src/lib.rs` writes `extern crate util;`; the binary's root `src/main.rs` declares a module of its own, `mod util;`, and the module `cli`. `src/cli.rs` is compiled by the binary alone, so its `use util::slug;` is relative to the binary's root, where `util` is the module `src/util.rs` (node `localutil`), not the dependency the library binds (node `depsrc`).

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
extern crate util;
```

```rust path=src/main.rs owner=root
mod util;
mod cli;
```

```rust path=src/util.rs owner=localutil
pub fn slug() {}
```

```rust path=src/cli.rs owner=cli
use util::slug;
```

## Expect

- src/lib.rs:1 -> node:depsrc         # the declaration names the crate util
- src/main.rs:1 -> node:localutil
- src/main.rs:2 -> node:cli
- src/cli.rs:1 -> node:localutil      # `util` as the root that compiles cli.rs binds it

## Why

Asking every root of the package for an `extern crate` before asking the file's own root for its items lets a declaration of another crate decide the path.
