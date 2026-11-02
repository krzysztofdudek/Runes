---
id: rust-autobins-off-bin-module-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Target auto-discovery (`autobins = false` in [package] turns off discovery of src/bin/*.rs and src/bin/*/main.rs; only declared [[bin]] targets remain); Rust Reference — Modules (a non-root module file resolves paths from its crate root)"
---

## Rule

With `autobins = false`, the files of `src/bin/` are no binary crates of their own: only the declared `[[bin]]` is (here `src/main.rs`, the package's default), and `src/bin/helper.rs` is not compiled unless a module declares it. So `crate::` in it is the tree of `src/main.rs`, never `src/bin/`: `use crate::util::Thing;` binds `src/util.rs` (node `src`), not a `src/bin/util.rs`. The control `src/bin/tool.rs` with `autobins` left on is its own crate root, as before.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
autobins = false
```

```rust path=src/main.rs
mod util;
mod bin;
```

```rust path=src/util.rs
pub struct Thing;
```

```rust path=src/bin/mod.rs
mod helper;
```

```rust path=src/bin/helper.rs
use crate::util::Thing;
```

## Expect

- src/main.rs:2 -> node:bin           # `mod bin;` → src/bin/mod.rs
- src/bin/helper.rs:1 -> node:src    # crate:: of the only bin crate, src/main.rs → src/util.rs, not src/bin/util.rs

## Why

Reading every file of `src/bin/` as a binary crate root, as auto-discovery would, makes `crate::` mean `src/bin/` and leaves the file's `crate::` items unbound.
