---
id: rust-path-attribute-in-inline-module-of-library-path-root-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Modules, The path attribute (for a path attribute inside an inline module block the path is relative to the directory of the source file with the names of the inline modules added; a source file that is not a module root or a mod.rs adds a directory with its own name first); a file loaded through a path attribute holds the modules it declares in its own directory, as a mod.rs does"
---

## Rule

The manifest names the library root `engine/root.rs`, so that file is a module root whatever it is called: the `mod x;` in its inline module `outer` loads `engine/outer/loaded.rs`, whose `mod child;` is `engine/outer/child.rs` (node `child`), not a file under a directory named `root`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[lib]
path = "engine/root.rs"
```

```rust path=engine/root.rs owner=root
mod outer {
    #[path = "loaded.rs"]
    mod x;
}
```

```rust path=engine/outer/loaded.rs owner=loaded
mod child;
```

```rust path=engine/outer/child.rs owner=child
pub struct C;
```

```rust path=engine/root/outer/child.rs owner=decoy
pub struct C;
```

## Expect

- engine/outer/loaded.rs:1 -> node:child   # `mod child;` in the file loaded from the inline module of a custom library root

## Why

The root of a library named by the manifest was treated as an ordinary module file whose inline modules lie in a directory of its own name.
