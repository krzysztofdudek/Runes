---
id: rust-module-of-unparsable-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` leaves a parenthesis open before `mod late;` (a file in the middle of an edit), and `src/main.rs` is a second crate with an `Opts` of its own. A root whose brackets do not balance cannot be read to the end, so the module is left to the first root and `crate::Opts` in `src/late/mod.rs` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
fn broken( {
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

- src/lib.rs:3 -> node:late    # `mod late;`
- src/late/mod.rs:1 -> node:root
