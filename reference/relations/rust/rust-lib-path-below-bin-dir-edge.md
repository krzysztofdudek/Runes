---
id: rust-lib-path-below-bin-dir-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Cargo Targets (the `path` field of the `[lib]` and `[[bin]]` targets names their crate roots); Rust Reference — Modules (a module's file lies below its crate root's directory); Runes issue 162"
---

## Rule

A package can place its library and its binary outside `src/`, one below the other: `[[bin]] path = "app/main.rs"` and `[lib] path = "app/lib/lib.rs"`. A file below `app/lib/` is a module of the library, whose root directory is the deepest crate-root directory holding it, not of the binary whose directory also holds it. So in `app/lib/jobs/run.rs`, `crate::util::Helper` binds the library's `app/lib/util/mod.rs` (node `util`) and `crate::Item` the library root `app/lib/lib.rs` (node `lib`). The binary's own `app/util.rs` and the `Item` declared in `app/main.rs` (node `app`) are same-named decoys.

## Files

```toml path=Cargo.toml
[package]
name = "shop"

[lib]
path = "app/lib/lib.rs"

[[bin]]
name = "shop"
path = "app/main.rs"
```

```rust path=app/main.rs
struct Item;
fn main() {}
```

```rust path=app/util.rs
pub struct Helper;
```

```rust path=app/lib/lib.rs
pub struct Item;
```

```rust path=app/lib/util/mod.rs
pub struct Helper;
```

```rust path=app/lib/jobs/run.rs
use crate::util::Helper;
use crate::Item;
```

## Expect

- app/lib/jobs/run.rs:1 -> node:util    # crate:: from a library module → the library's tree app/lib/, never the binary's app/util.rs (node:app)
- app/lib/jobs/run.rs:2 -> node:lib     # a crate-root item → the library root app/lib/lib.rs, never the binary root app/main.rs (node:app)

## Why

Choosing a file's crate by the binary's directory alone hands the library's modules to the binary, binding their `crate::` paths to same-named items of another crate.
