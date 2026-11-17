---
id: rust-mod-decl-inside-cfg-if-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Modules; cfg-if crate (`cfg_if!` expands to the items of the branch whose `cfg` holds)"
---

## Rule

`cfg_if! { if #[cfg(unix)] { mod unix; } else { mod other; } }` in `src/lib.rs` declares `src/unix/mod.rs` (node `unix`) on one target and `src/other/mod.rs` (node `other`) on another. Each branch is a module of the crate on some target, so each `mod` gives the edge to its file, from its own line.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
[dependencies]
cfg-if = "1"
```

```rust path=src/lib.rs owner=root
cfg_if::cfg_if! {
    if #[cfg(unix)] {
        mod unix;
    } else {
        mod other;
    }
}
```

```rust path=src/unix/mod.rs
pub fn f() {}
```

```rust path=src/other/mod.rs
pub fn f() {}
```

## Expect

- src/lib.rs:3 -> node:unix
- src/lib.rs:5 -> node:other

## Why

The macro's body is tokens to the parser, so a reader of items alone sees no `mod` here, though this is the usual shape of a platform layer.
