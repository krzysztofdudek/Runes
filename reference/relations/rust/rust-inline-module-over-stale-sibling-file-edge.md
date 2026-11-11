---
id: rust-inline-module-over-stale-sibling-file-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Modules (a `mod` with a body holds its items in place and loads no file)"
---

## Rule

`src/util/mod.rs` (node `util`) has the inline module `mod codec { pub fn encode() {} }`. A leftover `src/util/codec.rs` (node `stale`) is what a `mod codec;` without a body would load; no such declaration exists. `use crate::util::codec::encode;` names the function inside the inline module, in `src/util/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod util;
mod cmd;
```

```rust path=src/util/mod.rs owner=util
pub mod codec {
    pub fn encode() {}
}
```

```rust path=src/util/codec.rs owner=stale
pub fn old() {}
```

```rust path=src/cmd/mod.rs owner=cmd
use crate::util::codec::encode;
```

## Expect

- src/lib.rs:1 -> node:util
- src/lib.rs:2 -> node:cmd
- src/cmd/mod.rs:1 -> node:util      # the inline module of util; src/util/codec.rs is loaded by nothing
