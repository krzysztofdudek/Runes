---
id: rust-module-no-root-declares-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate); Rust Reference, Modules (a module file is compiled when a `mod` item, a `path` attribute or an included file names it)"
---

## Rule

`src/lib.rs` and `src/main.rs` are two crates, each with an `Opts`, and neither declares `mod orphan;`. That does not show that no crate compiles `src/orphan/mod.rs`: a `path` attribute, an included file or a macro anywhere in the tree may place it. So nothing is concluded, the roots are tried in their usual order, and `crate::Opts` binds `src/lib.rs` (owner root), as it did before roots were told apart.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
pub struct Opts;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/orphan/mod.rs owner=orphan
use crate::Opts;
```

## Expect

- src/orphan/mod.rs:1 -> node:root

## Why

An edge is dropped only where it is certain which crates compile the file. A missing declaration is no such certainty.
