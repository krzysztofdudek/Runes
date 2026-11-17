---
id: rust-path-attribute-in-inline-module-of-path-loaded-file-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Modules, The path attribute (for a path attribute inside an inline module block the path is relative to the directory of the source file with the names of the inline modules added; a source file that is not a module root or a mod.rs adds a directory with its own name first); a file loaded through a path attribute holds the modules it declares in its own directory, as a mod.rs does"
---

## Rule

`src/lib.rs` loads `src/plat/linux.rs` through `#[path]`. A file loaded that way owns its directory as a mod.rs does, so the `mod x;` in its inline module `inner`, carrying `#[path = "p.rs"]`, loads `src/plat/inner/p.rs`, with no directory named `linux`. That file's `mod leaf;` is `src/plat/inner/leaf.rs` (node `leaf`), not a file under `linux/`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=lib
#[path = "plat/linux.rs"]
mod linux;
```

```rust path=src/plat/linux.rs owner=linux
mod inner {
    #[path = "p.rs"]
    mod x;
}
```

```rust path=src/plat/inner/p.rs owner=p
mod leaf;
```

```rust path=src/plat/inner/leaf.rs owner=leaf
pub struct L;
```

```rust path=src/plat/linux/inner/leaf.rs owner=decoy
pub struct L;
```

## Expect

- src/lib.rs:2 -> node:linux   # the `mod` its `#[path]` attribute moves names the file the attribute gives
- src/plat/inner/p.rs:1 -> node:leaf   # `mod leaf;` in the file loaded from the inline module of a path-loaded file

## Why

A file loaded through a path attribute was taken for an ordinary module file, so the inline module in it was placed in a directory named after the file.
