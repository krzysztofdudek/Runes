---
id: rust-module-in-cfg-if-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate); the cfg-if crate (a `mod` written inside `cfg_if! { … }` is a module of the file that invokes it)"
---

## Rule

`src/lib.rs` declares `mod unix;` inside `cfg_if! { … }`, and `src/main.rs` is a second crate with an `Opts` of its own. `src/unix/mod.rs` is a module of the library, but a `mod` inside a macro's tokens is no item of the parse tree, and it is not followed when the roots that compile a file are told (the `mod` itself gives its edge, from line 3). Nothing is known about the file, so the roots are tried in their usual order and its `crate::Opts` binds `src/lib.rs` (owner root). The root takes `cfg_if!` from the registry crate `cfg-if` with `#[macro_use] extern crate`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
[dependencies]
cfg-if = "1"
```

```rust path=src/lib.rs owner=root
cfg_if! {
    if #[cfg(unix)] {
        mod unix;
    } else {
        mod other;
    }
}
pub struct Opts;
#[macro_use]
extern crate cfg_if;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/unix/mod.rs
use crate::Opts;
```

## Expect

- src/lib.rs:3 -> node:unix      # the `mod unix;` of the branch itself
- src/unix/mod.rs:1 -> node:root
