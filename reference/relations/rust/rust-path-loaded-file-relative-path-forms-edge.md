---
id: rust-path-loaded-file-relative-path-forms-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference — Modules, The path attribute (outside inline modules the path is relative to the directory of the file that writes the attribute)"
---

## Rule

The path of a `#[path]` attribute is relative to the directory of the file that writes it, in any spelling. `src/lib.rs` loads `src/platform/bsd.rs` as `./imp/../platform/bsd.rs`, and `src/net/mod.rs` loads `src/platform/sock.rs` as `../platform/sock.rs`. Both files own the directory `src/platform/`, so their `mod kqueue;` and `mod raw;` are `src/platform/kqueue.rs` and `src/platform/raw.rs` (node `platform`). A `#[path]` `mod` inside the inline module `wrap` follows another rule, so `src/platform/tty.rs` is not known to be loaded that way and keeps the directory named after it: its `mod line;` is `src/platform/tty/line.rs` (node `tty`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[path = "./imp/../platform/bsd.rs"]
mod bsd;
mod net;
mod wrap {
    #[path = "platform/tty.rs"]
    mod tty;
}
```

```rust path=src/net/mod.rs owner=root
#[path = "../platform/sock.rs"]
mod sock;
```

```rust path=src/platform/bsd.rs owner=bsd
mod kqueue;
```

```rust path=src/platform/sock.rs owner=sock
mod raw;
```

```rust path=src/platform/tty.rs owner=platform
mod line;
```

```rust path=src/platform/kqueue.rs
pub fn wait() {}
```

```rust path=src/platform/raw.rs
pub fn open() {}
```

```rust path=src/platform/tty/line.rs
pub fn read() {}
```

## Expect

- src/platform/bsd.rs:1 -> node:platform
- src/platform/sock.rs:1 -> node:platform
- src/platform/tty.rs:1 -> node:tty
