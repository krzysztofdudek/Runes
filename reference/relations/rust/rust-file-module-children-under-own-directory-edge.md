---
id: rust-file-module-children-under-own-directory-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference — Modules, Module source filenames (the children of a module in `linux.rs` live in the directory `linux/`)"
---

## Rule

`src/platform/mod.rs` declares `mod linux;` by its name, with no `#[path]` attribute. The children of `src/platform/linux.rs` then live under the directory named after it: its `mod epoll;` is `src/platform/linux/epoll.rs` (node `linux`), never `src/platform/epoll/mod.rs` (node `epoll`) beside it.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=platform
mod platform;
```

```rust path=src/platform/mod.rs
mod linux;
```

```rust path=src/platform/linux.rs
mod epoll;
```

```rust path=src/platform/linux/epoll.rs
pub fn wait() {}
```

```rust path=src/platform/epoll/mod.rs
pub fn decoy() {}
```

## Expect

- src/platform/linux.rs:1 -> node:linux      # under the directory named after the file
