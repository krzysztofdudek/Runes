---
id: rust-module-declared-by-unknown-macro-keeps-file-edge
language: rust
category: dynamic
expectation: edge
cites: "Rust Reference — Macros (a macro invocation among the items of a module can expand to any item, a `mod` included)"
---

## Rule

`src/proto/mod.rs` (node `proto`) writes no `mod net;`, and it invokes a macro of its own among its items, `modules!(net);`, which may expand to that declaration. What the file declares is then not known, so the file that fits the name keeps the edge: `use crate::proto::net::Frame;` binds `src/proto/net.rs` (node `net`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod proto;
mod cmd;
```

```rust path=src/proto/mod.rs owner=proto
macro_rules! modules {
    ($($name:ident),*) => { $(pub mod $name;)* };
}
modules!(net);
```

```rust path=src/proto/net.rs owner=net
pub struct Frame;
```

```rust path=src/cmd/mod.rs owner=cmd
use crate::proto::net::Frame;
```

## Expect

- src/lib.rs:1 -> node:proto
- src/lib.rs:2 -> node:cmd
- src/cmd/mod.rs:1 -> node:net      # the macro may declare the module, so the file is not ruled out

## Why

A file is refused as a module only where every `mod` of the module above it can be read. Refusing it under a macro would move the edge to the parent's file, away from the file the compiler reads.
