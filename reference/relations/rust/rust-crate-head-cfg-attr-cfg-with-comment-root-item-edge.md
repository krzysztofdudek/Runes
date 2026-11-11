---
id: rust-crate-head-cfg-attr-cfg-with-comment-root-item-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference, Conditional compilation (the cfg_attr attribute expands to the attributes after its predicate; a crate-level cfg that is false empties the crate); Rust Reference, Comments (a comment is whitespace between tokens)"
---

## Rule

`#![cfg_attr(all(), cfg /* c */ (any()))]` at the head of `src/lib.rs` applies `cfg(any())`, which never holds, so the library compiles none of its modules: its `mod x;` may be removed, as may its `mod decoy;`, whose file rustc never reads. A comment between `cfg` and its parentheses changes nothing. `src/main.rs` declares `mod x;` plainly, so it is the one root that certainly compiles `src/x.rs`, and `crate::Opts` there binds `src/main.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=lib
#![cfg_attr(all(), cfg /* c */ (any()))]
mod x;
mod decoy;
pub struct Opts;
```

```rust path=src/main.rs owner=bin
mod x;
struct Opts;
fn main() {}
```

```rust path=src/x.rs owner=x
use crate::Opts;
```

```rust path=src/decoy.rs owner=lib
compile_error!("the library never reads this file");
```

## Expect

- src/lib.rs:2 -> node:x    # `mod x;`, a declaration a `cfg` may remove, which still names its file
- src/main.rs:1 -> node:x   # `mod x;`
- src/x.rs:1 -> node:bin    # `crate::Opts`, the binary's own item

## Why

Reading the `cfg` inside a `cfg_attr` by matching its text misses it where a comment stands between the name and its parentheses. The library's declaration is then taken for one that certainly holds, two roots certainly compile `src/x.rs`, and its `crate::` path gives no edge.
