---
id: rust-path-loaded-file-children-beside-it-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference — Modules, The path attribute (a file loaded through `#[path]` on a `mod` outside inline modules is treated as a mod-rs file: its own `mod x;` is looked for beside it); rustc 1.x compiles the fixture"
---

## Rule

`src/lib.rs` writes `#[path = "platform/linux.rs"] mod sys;`. The file loaded that way owns its directory as a `mod.rs` does, so the `mod epoll;` of `src/platform/linux.rs` is `src/platform/epoll/mod.rs` (node `epoll`), beside it, and `use self::epoll::wait;` goes there too. `src/platform/linux/epoll.rs` (node `linux`), under the directory named after the file, is what the same `mod` would load had the file been declared by its name. The `#[path]` `mod` itself gives no edge.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[path = "platform/linux.rs"]
mod sys;
```

```rust path=src/platform/linux.rs owner=platform
mod epoll;
use self::epoll::wait;
```

```rust path=src/platform/epoll/mod.rs
pub fn wait() {}
```

```rust path=src/platform/linux/epoll.rs
pub fn decoy() {}
```

## Expect

- src/platform/linux.rs:1 -> node:epoll      # beside the file, as for a mod.rs
- src/platform/linux.rs:2 -> node:epoll

## Why

Reading the file as one declared by its name looks for its children one directory too deep, where the compiler never looks.
