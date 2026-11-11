---
id: rust-module-after-char-literal-brace-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Tokens (a character literal `'{'` is one token, not a brace); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` has a function that returns the character literal `'{'` and declares `mod late;` after it, and `src/main.rs` is a second crate with an `Opts` of its own. The brace in the literal opens nothing, so `mod late;` is a module of the library and `src/late/mod.rs` binds `crate::Opts` to `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
pub fn open() -> char {
    '{'
}
mod late;
pub struct Opts;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/late/mod.rs
use crate::Opts;
```

## Expect

- src/lib.rs:4 -> node:late    # `mod late;`
- src/late/mod.rs:1 -> node:root
