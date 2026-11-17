---
id: rust-mod-path-attribute-override-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Modules, The path attribute (for a path attribute outside inline module blocks, the file path is relative to the directory the source file is located)"
---

## Rule

A `#[path = "…"] mod foo;` among the items of a file overrides the conventional file location of the child module: the attribute's path, read from the directory of the file that writes it, is the module's file. Here `src/c/mod.rs` writes `#[path = "custom/loc.rs"] mod foo;`, so the module `foo` is `src/c/custom/loc.rs` (node `custom`), and the `mod` gives an edge to it.

## Files

```toml path=Cargo.toml
[package]
name = "mycrate"
```

```rust path=src/c/custom/loc.rs
pub struct X;
```

```rust path=src/c/mod.rs
#[path = "custom/loc.rs"]
mod foo;
```

## Expect

- src/c/mod.rs:2 -> node:custom   # the `mod` the `#[path]` attribute moves names the file the attribute gives

## Why

Outside inline modules the attribute's path starts at the directory of the file that writes it, whatever that file is, so the file it names is known from the source alone. Skipping every `mod` with a `#[path]` attribute hid that dependency from every consumer.
