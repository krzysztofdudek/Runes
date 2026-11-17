---
id: rust-module-declared-in-cfg-if-and-stale-root-file-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Modules (a file is a module only when a `mod` item declares it); cfg-if crate"
---

## Rule

`src/lib.rs` (node `root`) declares `mod unix;` inside a `cfg_if!` branch and defines `pub fn legacy()`. A `mod` in a `cfg_if!` branch declares its module like any other, so `use crate::unix::f;` binds `src/unix/mod.rs` (node `unix`). No `mod` declares the leftover `src/legacy.rs` (node `stale`), so `use crate::legacy;` names the root's function and binds the root file. The root takes `cfg_if!` from the registry crate `cfg-if` with `#[macro_use] extern crate`.

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
    }
}
mod api;
pub fn legacy() {}
#[macro_use]
extern crate cfg_if;
```

```rust path=src/unix/mod.rs
pub fn f() {}
```

```rust path=src/legacy.rs owner=stale
pub fn old() {}
```

```rust path=src/api/mod.rs
use crate::unix::f;
use crate::legacy;
```

## Expect

- src/lib.rs:3 -> node:unix
- src/lib.rs:6 -> node:api
- src/api/mod.rs:1 -> node:unix      # declared in the `cfg_if!` branch
- src/api/mod.rs:2 -> node:root      # a function of the root; no `mod` declares src/legacy.rs
