---
id: rust-path-attribute-in-inline-module-of-bin-root-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Modules, The path attribute (for a path attribute inside an inline module block the path is relative to the directory of the source file with the names of the inline modules added; a source file that is not a module root or a mod.rs adds a directory with its own name first); a file loaded through a path attribute holds the modules it declares in its own directory, as a mod.rs does"
---

## Rule

`src/bin/tool.rs` is the root of a binary crate, so it owns its directory like a `lib.rs` does: the `mod x;` in its inline module `outer` carries `#[path = "loaded.rs"]`, and its file is `src/bin/outer/loaded.rs`, with no directory named `tool` in the path. That file declares `mod child;`, which is `src/bin/outer/child.rs` (node `child`), not the file in a directory of its own name (node `decoy`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=lib
pub fn lib() {}
```

```rust path=src/bin/tool.rs owner=tool
mod outer {
    #[path = "loaded.rs"]
    mod x;
}
fn main() {}
```

```rust path=src/bin/outer/loaded.rs owner=loaded
mod child;
```

```rust path=src/bin/outer/child.rs owner=child
pub struct C;
```

```rust path=src/bin/outer/loaded/child.rs owner=decoy
pub struct C;
```

## Expect

- src/bin/outer/loaded.rs:1 -> node:child   # `mod child;` in the file the inline module's `path` attribute loaded

## Why

A file was a module root only if it was called lib.rs, main.rs or mod.rs, so the root of a binary under src/bin was given the directory of its own name and the file its attribute names was not found.
