---
id: rust-other-binary-root-declared-as-module-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Modules (a `mod` item makes the file a module of the crate that writes it); The Cargo Book — Cargo Targets, Binaries"
---

## Rule

The binary `src/bin/server.rs` (node `server`) declares `mod serve;`, so `src/bin/serve.rs` (node `servebin`) is a module of `server` as well as a binary of its own. `crate::serve::run()` in `server.rs` names that module and binds its file.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/bin/server.rs owner=server
mod serve;
fn main() { crate::serve::run(); }
```

```rust path=src/bin/serve.rs owner=servebin
pub fn run() {}
fn main() {}
```

## Expect

- src/bin/server.rs:1 -> node:servebin
- src/bin/server.rs:2 -> node:servebin      # the `mod serve;` of line 1 makes the file a module
