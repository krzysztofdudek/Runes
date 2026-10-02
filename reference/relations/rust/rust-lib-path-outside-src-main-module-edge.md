---
id: rust-lib-path-outside-src-main-module-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Cargo Targets (the `path` field of the `[lib]` target names its crate root; `src/main.rs` is auto-discovered as the default binary); Rust Reference — Modules (a module's file lies below its crate root's directory); Runes issue 173"
---

## Rule

A package can place its library outside `src/`: `[lib] path = "core/lib.rs"`. `src/main.rs` is then still the default binary, auto-discovered, and a file under `src/` is a module of that binary, not of the library, whose directory does not hold it. So in `src/cli/run.rs`, `crate::Config` binds the binary root `src/main.rs` (node `src`), never the library's same-named `Config` in `core/lib.rs` (node `core`), and `crate::LibOnly`, an item only the library declares, binds nothing (line 2). The package's own name still addresses the library from the binary's modules: `shop::Engine` binds `core/lib.rs` (line 3).

## Files

```toml path=Cargo.toml
[package]
name = "shop"

[lib]
path = "core/lib.rs"
```

```rust path=core/lib.rs
pub struct Config;
pub struct LibOnly;
pub struct Engine;
```

```rust path=src/main.rs
mod cli;
pub struct Config;
fn main() {}
```

```rust path=src/cli/run.rs
use crate::Config;
use crate::LibOnly;
use shop::Engine;
```

## Expect

- src/cli/run.rs:1 -> node:src     # crate:: from a module of the default binary → its root src/main.rs, never the library's core/lib.rs (node:core)
- src/cli/run.rs:3 -> node:core    # the package's own name → the library root core/lib.rs; line 2 (an item only the library declares) stays silent

## Why

Probing the library's root first for every `src/` file, wherever the library lies, hands the binary's `crate::` paths to the library: a false edge for a name both declare, and a false edge for a name only the library has.
