---
id: rust-mod-path-attribute-relative-to-declaring-file-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Modules, The path attribute (for a path attribute outside inline module blocks, the file path is relative to the directory the source file is located; for one inside inline module blocks, the directory depends on the kind of file and the inline modules around it); rustc 1.99.1 loads `src/data/orphan.rs` and `src/data/d.rs` for the fixture"
---

## Rule

A `mod` with a `#[path]` attribute among the items of its file loads the file the attribute names, read from the directory of the file that writes it, whatever kind of file that is. `src/ui/mod.rs` writes the attribute on its own line, `#[path = "../data/orphan.rs"]`, above `pub mod via_attr;`: the module is `src/data/orphan.rs` (node `orphan`), not `src/ui/via_attr.rs` (node `decoy`). `src/ui/f.rs` is no mod.rs, and still writes `#[path = "../data/d.rs"] mod dd;` on one line relative to its own directory, `src/ui/`: the module is `src/data/d.rs` (node `d`), not `src/ui/f/dd.rs` (node `decoy`). In `src/lib.rs` the inline module `moved` carries a `#[path]` attribute of its own, and the `mod y;` inside it, with its own attribute, stays silent: where its path starts depends on nesting rules a source-only walk does not pin.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs
pub mod ui;
#[path = "elsewhere"]
mod moved {
    #[path = "y.rs"]
    mod y;
}
```

```rust path=src/ui/mod.rs
pub mod f;
#[path = "../data/orphan.rs"]
pub mod via_attr;
```

```rust path=src/ui/f.rs
#[path = "../data/d.rs"] mod dd;
```

```rust path=src/data/orphan.rs owner=orphan
pub struct Orphan;
```

```rust path=src/data/d.rs owner=d
pub fn f() {}
```

```rust path=src/elsewhere/y.rs owner=moved
pub struct Y;
```

```rust path=src/ui/via_attr.rs owner=decoy
pub struct Orphan;
```

```rust path=src/ui/f/dd.rs owner=decoy
pub fn f() {}
```

## Expect

- src/lib.rs:1 -> node:ui   # `pub mod ui;`
- src/ui/mod.rs:3 -> node:orphan   # the attribute on its own line, read from `src/ui/`
- src/ui/f.rs:1 -> node:d   # the attribute on the line of the `mod`, read from the directory of `src/ui/f.rs`, not from `src/ui/f/`

## Why

The attribute names its file, and the reader declared the files it loads, but the `mod` that carries it was skipped, so the file that declares the module had no edge to it and a layer check saw nothing of the dependency.
