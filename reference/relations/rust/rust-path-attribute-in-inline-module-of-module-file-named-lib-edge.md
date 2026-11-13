---
id: rust-path-attribute-in-inline-module-of-module-file-named-lib-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Modules, The path attribute (for a path attribute inside an inline module block the path is relative to the directory of the source file with the names of the inline modules added; a source file that is not a crate root or a mod.rs adds a directory with its own name first); a file loaded through a path attribute holds the modules it declares in its own directory, as a mod.rs does"
---

## Rule

`src/a/lib.rs` is the module `a::lib`, declared by name with `mod lib;` in `src/a.rs`, so it is no crate root although it is named `lib.rs`: an inline module in it lies in a directory of the file's own name. The `mod x;` in `outer`, carrying `#[path = "loaded.rs"]`, loads `src/a/lib/outer/loaded.rs`, whose `mod child;` is `src/a/lib/outer/child.rs` (node `child`). `src/a/outer/loaded.rs` is loaded by nothing, so its `mod child;` gives no edge to `src/a/outer/child.rs` (node `decoy`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod a;
```

```rust path=src/a.rs owner=a
mod lib;
```

```rust path=src/a/lib.rs owner=lib
mod outer {
    #[path = "loaded.rs"]
    mod x;
}
```

```rust path=src/a/lib/outer/loaded.rs owner=loaded
mod child;
```

```rust path=src/a/lib/outer/child.rs owner=child
pub struct C;
```

```rust path=src/a/outer/loaded.rs owner=stray
mod child;
```

```rust path=src/a/outer/child.rs owner=decoy
pub struct C;
```

## Expect

- src/lib.rs:1 -> node:a   # `mod a;`
- src/a.rs:1 -> node:lib   # `mod lib;`
- src/a/lib/outer/loaded.rs:1 -> node:child   # `mod child;` in the file loaded from the inline module of a module file named lib.rs

## Why

A crate root holds its inline modules in its own directory, and Cargo's crate roots are often named `lib.rs` or `main.rs`; a module file that only shares that name is not one, and rustc places its inline modules as it does for any other module file.
