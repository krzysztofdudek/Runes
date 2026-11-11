---
id: rust-module-through-include-in-module-file-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Macros (the built-in `include!` parses a file as items at the place it is written); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` declares `mod a;`, and `src/a.rs` writes `include!("gen.rs");`, so the items of `src/gen.rs` are items of the module `a`. `src/main.rs` is a second crate with an `Opts` of its own. No root declares a module called `gen`, and the file is still compiled into the library, so the roots are tried in their usual order, and `crate::Opts` in `src/gen.rs` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod a;
pub struct Opts;
```

```rust path=src/a.rs owner=root
include!("gen.rs");
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/gen.rs owner=gen
use crate::Opts;
```

## Expect

- src/gen.rs:1 -> node:root
