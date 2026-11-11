---
id: rust-mod-decl-inside-cfg-if-nested-inline-and-path-edge
language: rust
category: nested
expectation: edge
cites: "Rust Reference — Modules, Module source filenames, The path attribute; cfg-if crate"
---

## Rule

Inside a `cfg_if!` branch a `mod` follows the rules it follows outside. A `mod inner;` inside the inline `mod sys { … }` lives under the directory named after `sys` (`src/sys/inner.rs`, node `sys`). A `mod` with a `#[path]` attribute is skipped, also behind a doc comment and a visibility, so the conventional `src/net/mod.rs` (node `net`) gets no edge. An inline `mod` gives no edge itself. A `cfg_if!` nested in a branch is read the same way: `mod windows;` and `mod other;` bind their files. The `cfg_if!` inside the inline module `deep` of the file declares `src/deep/leaf.rs` (node `deep`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
cfg_if! {
    if #[cfg(unix)] {
        mod sys {
            mod inner;
        }
        #[path = "imp/net.rs"]
        /// Sockets.
        pub(crate) mod net;
    } else {
        cfg_if! {
            if #[cfg(windows)] {
                pub mod windows;
            } else {
                mod other;
            }
        }
    }
}
mod deep {
    cfg_if! {
        if #[cfg(unix)] {
            mod leaf;
        }
    }
}
```

```rust path=src/sys/inner.rs
pub fn f() {}
```

```rust path=src/inner.rs owner=root
pub fn decoy() {}
```

```rust path=src/imp/net.rs owner=root
pub fn f() {}
```

```rust path=src/net/mod.rs
pub fn decoy() {}
```

```rust path=src/windows/mod.rs
pub fn f() {}
```

```rust path=src/other/mod.rs
pub fn f() {}
```

```rust path=src/deep/leaf.rs
pub fn f() {}
```

## Expect

- src/lib.rs:4 -> node:sys
- src/lib.rs:12 -> node:windows
- src/lib.rs:14 -> node:other
- src/lib.rs:22 -> node:deep
