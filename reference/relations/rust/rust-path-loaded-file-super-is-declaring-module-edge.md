---
id: rust-path-loaded-file-super-is-declaring-module-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference, Modules, The path attribute (the attribute names the file of the module the mod item declares, wherever it lies); Rust Reference, Paths (super names the parent module in the module tree)"
---

## Rule

`super` is the parent in the module tree, not the directory above a file. `src/lib.rs` loads `src/platform/linux.rs` as its module `sys`, so `super::Config` there is the crate root's `Config` in `src/lib.rs` (node `root`), not the `Config` of the module `platform`, `src/platform/mod.rs` (node `platform`), whose directory the file lies in. `src/net/mod.rs` loads `src/platform/sock.rs` as its module `sock`, so `super::Pool` there is `net`'s `Pool` (node `net`), and `super::super::Config` the crate root's.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[path = "platform/linux.rs"]
mod sys;
mod platform;
mod net;
struct Config;
```

```rust path=src/platform/mod.rs owner=platform
pub struct Config;
```

```rust path=src/platform/linux.rs owner=linux
use super::Config;
```

```rust path=src/net/mod.rs owner=net
#[path = "../platform/sock.rs"]
mod sock;
struct Pool;
```

```rust path=src/platform/sock.rs owner=sock
use super::Pool;
use super::super::Config;
```

## Expect

- src/lib.rs:2 -> node:linux   # the `mod` its `#[path]` attribute moves names the file the attribute gives
- src/net/mod.rs:2 -> node:sock   # the `mod` its `#[path]` attribute moves names the file the attribute gives
- src/lib.rs:3 -> node:platform
- src/lib.rs:4 -> node:net
- src/platform/linux.rs:1 -> node:root   # `super` is the crate root, which loads the file as `sys`
- src/platform/sock.rs:1 -> node:net     # `super` is `net`, which loads the file as `sock`
- src/platform/sock.rs:2 -> node:root

## Why

Climbing from a file loaded through a `path` attribute by its place on disk binds a module the file is not a child of.
