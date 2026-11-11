---
id: rust-other-binary-root-not-a-module-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Modules (a file is a module only when a `mod` item declares it); The Cargo Book — Cargo Targets, Binaries (each file of `src/bin/` is a crate of its own)"
---

## Rule

The binary `src/bin/server.rs` (node `server`) defines `fn serve()` and calls `crate::serve()`. `src/bin/serve.rs` (node `servebin`) is another binary, a crate of its own, and no module of `server`. The call names the function of `server.rs` itself, so there is no edge to another node.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/bin/server.rs owner=server
fn serve() {}
fn main() { crate::serve(); }
```

```rust path=src/bin/serve.rs owner=servebin
fn main() {}
```

## Expect

- silence      # `serve` is a function of server.rs; src/bin/serve.rs is another crate

## Why

Another target's root file is never a module of this crate unless a `mod` declares it.
