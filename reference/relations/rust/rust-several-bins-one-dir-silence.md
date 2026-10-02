---
id: rust-several-bins-one-dir-silence
language: rust
category: import
expectation: silence
cites: "The Cargo Book — Cargo Targets (each `[[bin]]` target's `path` names its own crate root); Rust Reference — Modules (a module belongs to the crate whose root declares it); Runes issue 162"
---

## Rule

Two `[[bin]]` targets can share a directory: `tools/a.rs` and `tools/b.rs` root two binary crates. A module file beside them, `tools/cmd/run.rs`, belongs to whichever root declares `mod cmd;`, which a path-based reader cannot tell. So `crate::Opts` in it binds no crate root: `tools/a.rs` (node `tools`) declares an `Opts`, but the module may be `b`'s, whose crate has none. Each root file still resolves its own `crate::` paths, and a module path below the shared directory still resolves the same way in both crates.

## Files

```toml path=Cargo.toml
[package]
name = "kit"

[[bin]]
name = "a"
path = "tools/a.rs"

[[bin]]
name = "b"
path = "tools/b.rs"
```

```rust path=tools/a.rs
pub struct Opts;
fn main() {}
```

```rust path=tools/b.rs
mod cmd;
fn main() {}
```

```rust path=tools/cmd/run.rs
use crate::Opts;
```

## Expect

- silence      # crate::Opts from a module of one of two binaries in tools/ → no crate root to bind; never the first binary's tools/a.rs (node:tools)

## Why

Binding a shared directory's modules to the first listed binary points `crate::` items at a crate the module may not belong to, a false edge.
