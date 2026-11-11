---
id: rust-module-after-raw-string-brace-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Tokens (a raw string literal ends at its own `\"` and hashes, whatever quote or brace it holds); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` holds a raw string with one quote and an opening brace inside it (a reader that pairs the quotes takes the brace for code) and declares `mod late;` after it, and `src/main.rs` is a second crate with an `Opts` of its own. The string is one token, so `mod late;` is a module of the library and `src/late/mod.rs` binds `crate::Opts` to `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
pub const TEMPLATE: &str = r#"say "hi {"#;
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

- src/lib.rs:2 -> node:late    # `mod late;`
- src/late/mod.rs:1 -> node:root
