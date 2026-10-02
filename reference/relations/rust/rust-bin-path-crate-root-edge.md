---
id: rust-bin-path-crate-root-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Cargo Targets (the `path` field of a `[[bin]]` target names its crate root); Rust Reference — Modules (a crate root file resolves `mod` beside itself); Runes issue 162"
---

## Rule

A `[[bin]]` table's `path` names the root of a binary crate wherever it lies; ripgrep keeps its `rg` binary at `crates/core/main.rs`. `crate::` in that file, and in every file below its directory, names that binary crate, whose module tree is rooted at `crates/core/`. So `mod flags;` and `use crate::flags::HiArgs;` in `crates/core/main.rs`, and `use crate::flags::HiArgs;` in `crates/core/search.rs`, bind `crates/core/flags/mod.rs` (node `flags`). The module `src/flags.rs` (node `src`) is a same-named decoy in the default tree, which holds no part of that binary.

## Files

```toml path=Cargo.toml
[package]
name = "ripgrep"

[[bin]]
bench = false
path = "crates/core/main.rs"
name = "rg"
```

```rust path=src/flags.rs
pub struct HiArgs;
```

```rust path=crates/core/flags/mod.rs
pub struct HiArgs;
```

```rust path=crates/core/main.rs
mod flags;
use crate::flags::HiArgs;
```

```rust path=crates/core/search.rs
use crate::flags::HiArgs;
```

## Expect

- crates/core/main.rs:1 -> node:flags     # `mod flags;` in the [[bin]] crate root → crates/core/flags/mod.rs
- crates/core/main.rs:2 -> node:flags     # crate:: from the [[bin]] crate root → crates/core/, never the decoy src/flags.rs (node:src)
- crates/core/search.rs:1 -> node:flags   # a file below the root's directory belongs to the same binary crate

## Why

A resolver that knows only the auto-discovered targets roots every file outside them at `src/`, so the `crate::` paths of a binary placed elsewhere resolve to nothing, or to a same-named module of another crate.
