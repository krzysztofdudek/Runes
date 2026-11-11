---
id: rust-edition-2015-bin-in-src-of-2018-package-bare-use-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Use declarations (in edition 2015 a `use` path is relative to the crate root; from 2018 on a bare first segment is a crate or a name in scope); Cargo Book, Cargo Targets (the `edition` field of a target)"
---

## Rule

The package is edition 2018, and its `[[bin]]` at `src/cli.rs` writes `edition = "2015"`. `src/cli.rs` declares `mod foo;` and `mod args;`, so the binary is the one root known to compile `src/args/mod.rs`, and the file reads its paths in that binary's edition. There `use foo::Bar;` is relative to the crate root and names the module `foo` the binary declares: an edge to `src/foo.rs` (owner foo).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2018"
[[bin]]
name = "cli"
path = "src/cli.rs"
edition = "2015"
```

```rust path=src/cli.rs owner=bin
mod foo;
mod args;
fn main() {}
```

```rust path=src/foo.rs owner=foo
pub struct Bar;
```

```rust path=src/args/mod.rs owner=args
use foo::Bar;
```

## Expect

- src/cli.rs:1 -> node:foo    # `mod foo;` in the binary root
- src/cli.rs:2 -> node:args   # `mod args;` in the binary root
- src/args/mod.rs:1 -> node:foo
