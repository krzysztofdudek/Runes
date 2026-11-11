---
id: rust-function-named-like-undeclared-sibling-file-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Modules (a file is a module only when a `mod` item declares it); Paths; rustc 1.x compiles the fixture and calls the function"
---

## Rule

`src/util/mod.rs` (node `util`) defines `pub fn parse()` and declares no `mod parse;`. A leftover file `src/util/parse.rs` (node `stale`) is in no module tree. `use crate::util::parse;` in `src/cmd/mod.rs` names the function, an item of `src/util/mod.rs`, never the stale file.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod util;
mod cmd;
```

```rust path=src/util/mod.rs owner=util
pub fn parse() {}
```

```rust path=src/util/parse.rs owner=stale
pub fn old() {}
```

```rust path=src/cmd/mod.rs owner=cmd
use crate::util::parse;
```

## Expect

- src/lib.rs:1 -> node:util
- src/lib.rs:2 -> node:cmd
- src/cmd/mod.rs:1 -> node:util      # `parse` is a function of util; no `mod` declares src/util/parse.rs

## Why

Taking a file for a module because its name fits binds a file the compiler never reads. The module that would declare it says whether it is one.
