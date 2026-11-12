---
id: rust-path-attribute-in-inline-module-loaded-file-owns-directory-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Modules, The path attribute (for a path attribute inside an inline module block the path is relative to the directory of the source file with the names of the inline modules added); a file loaded through a path attribute holds the modules it declares in its own directory, as a mod.rs does"
---

## Rule

The `mod x;` in the inline module `outer` of `src/lib.rs` carries `#[path = "loaded.rs"]`, so its file is `src/outer/loaded.rs`: the inline module's name is a directory of the path. That file declares `mod child;`, and a file loaded through a path attribute holds its modules in its own directory, so the child is `src/outer/child.rs` (node `child`), never `src/outer/loaded/child.rs` (node `decoy`), where a file that was not loaded that way would look.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=lib
pub mod outer {
    #[path = "loaded.rs"]
    mod x;
}
```

```rust path=src/outer/loaded.rs owner=loaded
mod child;
```

```rust path=src/outer/child.rs owner=child
pub struct C;
```

```rust path=src/outer/loaded/child.rs owner=decoy
pub struct C;
```

## Expect

- src/outer/loaded.rs:1 -> node:child   # `mod child;` in the file the inline module's `path` attribute loaded

## Why

The path attribute inside an inline module was not read, so the file it loads was taken for an ordinary module file whose children lie in a directory of its own name, and the edge went to the leftover file there, or was lost.
