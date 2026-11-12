---
id: rust-path-loaded-file-relative-path-forms-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference — Modules, The path attribute (outside inline modules the path is relative to the directory of the file that writes the attribute)"
---

## Rule

The path of a `#[path]` attribute is relative to the directory of the file that writes it, in any spelling. `src/lib.rs` loads `src/platform/bsd.rs` as `./platform/../platform/bsd.rs`, and `src/net/mod.rs` loads `src/platform/sock.rs` as `../platform/sock.rs`. Both files own the directory `src/platform/`, so their `mod kqueue;` and `mod raw;` are `src/platform/kqueue.rs` and `src/platform/raw.rs` (node `platform`). A `#[path]` `mod` inside the inline module `wrap` is relative to `src/wrap/`, so `../platform/tty.rs` there loads `src/platform/tty.rs` (the directory `src/wrap/` must exist for that path to be opened; its `stray.rs` is a file no `mod` declares, which rustc never reads), whose `mod line;` rustc reads beside it, `src/platform/line.rs` (node `line`). The `path` attribute inside the inline module is read too, so `src/platform/tty.rs` is known to be loaded that way and owns its directory like the others: its `mod line;` is `src/platform/line.rs`, not a file under `src/platform/tty/`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[path = "./platform/../platform/bsd.rs"]
mod bsd;
mod net;
mod wrap {
    #[path = "../platform/tty.rs"]
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

```rust path=src/platform/line.rs owner=line
pub fn read() {}
```

```rust path=src/wrap/stray.rs owner=wrap
compile_error!("no mod declares this file");
```

## Expect

- src/platform/bsd.rs:1 -> node:platform
- src/platform/sock.rs:1 -> node:platform
- src/platform/tty.rs:1 -> node:line      # the file loaded from inside the inline module `wrap` owns its directory
