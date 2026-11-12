---
id: rust-path-attribute-in-inline-module-of-plain-module-file-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Modules, The path attribute (for a path attribute inside an inline module block the path is relative to the directory of the source file with the names of the inline modules added; a source file that is not a module root or a mod.rs adds a directory with its own name first); a file loaded through a path attribute holds the modules it declares in its own directory, as a mod.rs does"
---

## Rule

`src/util.rs` is declared by name and is no module root, so an inline module in it lies in a directory of the file's own name: the `mod x;` in `outer`, carrying `#[path = "loaded.rs"]`, loads `src/util/outer/loaded.rs`, whose `mod child;` is `src/util/outer/child.rs` (node `child`), not a file beside `util.rs` (node `decoy`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=lib
mod util;
```

```rust path=src/util.rs owner=util
mod outer {
    #[path = "loaded.rs"]
    mod x;
}
```

```rust path=src/util/outer/loaded.rs owner=loaded
mod child;
```

```rust path=src/util/outer/child.rs owner=child
pub struct C;
```

```rust path=src/outer/child.rs owner=decoy
pub struct C;
```

## Expect

- src/lib.rs:1 -> node:util   # `mod util;`
- src/util/outer/loaded.rs:1 -> node:child   # `mod child;` in the file loaded from the inline module of a file that is no module root

## Why

A guard for the rule beside the others: only a module root and a mod.rs hold their inline modules directly in their own directory.
