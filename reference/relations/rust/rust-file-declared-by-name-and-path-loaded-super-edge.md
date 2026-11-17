---
id: rust-file-declared-by-name-and-path-loaded-super-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Modules, The path attribute (the attribute names the file of the module the mod item declares, wherever it lies); Rust Reference, Paths (super names the parent module in the module tree)"
---

## Rule

One file can be a module of two crates. `src/lib.rs` declares `mod util;` by name, so `src/util.rs` is the library's module `util`; the test `tests/it.rs` loads the same file through `#[path = "../src/util.rs"] mod util;`, so it is the test's module `util` too. Its `super::Thing` is the library root's `Thing` in the one crate and the test root's in the other. The module that declares the file by name is its parent as before, so the path binds `src/lib.rs` (node `lib`); the file that loads it through the attribute is a parent in addition, read only where the first names nothing.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=lib
mod util;
pub struct Thing;
```

```rust path=tests/it.rs owner=it
#[path = "../src/util.rs"]
mod util;
struct Thing;
```

```rust path=src/util.rs owner=util
use super::Thing;
```

## Expect

- tests/it.rs:2 -> node:util   # the `mod` its `#[path]` attribute moves names the file the attribute gives
- src/lib.rs:1 -> node:util   # `mod util;`
- src/util.rs:1 -> node:lib   # `super` by name is the library root

## Why

Taking the file that loads a module through a `path` attribute as its only parent drops the parent that declares it by name, and the edge to that crate's root moves to a test.
