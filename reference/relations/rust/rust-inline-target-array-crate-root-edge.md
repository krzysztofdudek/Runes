---
id: rust-inline-target-array-crate-root-edge
language: rust
category: import
expectation: edge
cites: "TOML 1.0 — an array of tables may be written inline (`bin = [{ … }]` is the same value as `[[bin]]` tables); The Cargo Book — Cargo Targets (the `path` of a target names its crate root); Runes issue 181"
---

## Rule

A target array written inline at the top of Cargo.toml (`bin = [{ name = "tool", path = "tools/tool/main.rs" }]`, `test = [{ … }]`) is the same value as the `[[bin]]` and `[[test]]` tables, so each element's `path` roots its crate exactly as a table's does. In `tools/tool/cmd/run.rs`, `crate::state::Model` binds `tools/tool/state.rs` and `crate::Config` the binary's root (node `tool`), never the library's `src/state.rs` or `Config` (node `src`); in `suites/cases/login.rs`, `crate::support::Fixture` binds `suites/support/mod.rs`, never `src/support.rs`.

## Files

```toml path=Cargo.toml
bin = [{ name = "tool", path = "tools/tool/main.rs" }]
test = [
  { name = "suite", path = "suites/suite.rs" },
]

[package]
name = "app"
```

```rust path=src/lib.rs
pub mod state;
pub mod support;
pub struct Config;
```

```rust path=src/state.rs
pub struct Model;
```

```rust path=src/support.rs
pub struct Fixture;
```

```rust path=tools/tool/main.rs
mod state;
mod cmd;
pub struct Config;
```

```rust path=tools/tool/state.rs
pub struct Model;
```

```rust path=tools/tool/cmd/mod.rs
mod run;
```

```rust path=tools/tool/cmd/run.rs
use crate::state::Model;
use crate::Config;
```

```rust path=suites/suite.rs
mod support;
mod cases;
```

```rust path=suites/support/mod.rs
pub struct Fixture;
```

```rust path=suites/cases/login.rs
use crate::support::Fixture;
```

## Expect

- tools/tool/main.rs:2 -> node:cmd          # `mod cmd;` in the binary's root → tools/tool/cmd/mod.rs
- tools/tool/cmd/run.rs:1 -> node:tool      # crate:: of the inline [[bin]] crate → tools/tool/state.rs, never src/state.rs (node:src)
- tools/tool/cmd/run.rs:2 -> node:tool      # a crate-root item → the binary's root tools/tool/main.rs, never the library's Config
- suites/suite.rs:1 -> node:support         # `mod support;` in the inline [[test]] root → suites/support/mod.rs
- suites/cases/login.rs:1 -> node:support   # crate:: of the [[test]] crate → suites/support/mod.rs, never src/support.rs (node:src)

## Why

Reading only the `[[bin]]` table form leaves an inline target's root a module of the library's tree, so its `crate::` paths bind the library's same-named modules and items.
