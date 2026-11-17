---
id: rust-mod-path-attribute-before-doc-comment-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Modules, The path attribute; Attributes; Comments (doc comments are attributes: outer attributes, doc comments and comments stand in front of an item in any order); rustc 1.x loads `src/imp/unix.rs` for the fixture's `mod sys;`"
---

## Rule

`#[path = "imp/unix.rs"]`, then a doc comment, then `mod sys;`: the attribute still belongs to the `mod`, so the module's file is `src/imp/unix.rs`. The same holds for `mod net;`, whose `#[path]` is followed by a line comment, a block comment and another attribute. The files at the conventional places, `src/sys/mod.rs` (node `sys`) and `src/net/mod.rs` (node `net`), are no modules of the crate and get no edge. Each `mod` names the file its attribute gives, `src/imp/unix.rs` and `src/imp/net.rs`, which lie in the node of `src/lib.rs`, so no edge crosses a node and the expected outcome is silence.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs
#[path = "imp/unix.rs"]
/// Platform layer.
mod sys;
#[path = "imp/net.rs"]
// sockets
/* and nothing else */
#[allow(dead_code)]
mod net;
```

```rust path=src/imp/unix.rs owner=src
pub fn f() {}
```

```rust path=src/imp/net.rs owner=src
pub fn f() {}
```

```rust path=src/sys/mod.rs
pub fn f() {}
```

```rust path=src/net/mod.rs
pub fn f() {}
```

## Expect

- silence      # both mods name files of their own node through their `#[path]` attributes; the conventional files are decoys

## Why

Looking for the attribute only right above the `mod` misses it behind a doc comment, and the `mod` is then resolved at the conventional place: an edge to a file the compiler never reads.
