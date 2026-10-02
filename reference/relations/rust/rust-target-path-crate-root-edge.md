---
id: rust-target-path-crate-root-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Cargo Targets (the `path` field of a `[[test]]`, `[[example]]` or `[[bench]]` target names its crate root); Rust Reference — Modules (a crate root file resolves `mod` beside itself); Runes issue 173"
---

## Rule

The `path` of a `[[test]]`, `[[example]]` or `[[bench]]` table names the root of that target's crate wherever it lies, as a `[[bin]]` path does. zed keeps integration tests at `tests/integration/<name>_tests.rs`, a directory with no `main.rs` for auto-discovery to find. `crate::` in the root and in every file below its directory names that crate. So in `tests/integration/cases/login.rs`, `crate::support::Fixture` binds `tests/integration/support/mod.rs` (node `support`) and `crate::TestServer` the test root `tests/integration/suite.rs` (node `integration`); in `demos/viewer/panels/list.rs`, `crate::state::Model` binds `demos/viewer/state.rs` (node `viewer`); in `perf/cases/sort.rs`, `crate::Harness` binds `perf/bench_main.rs` (node `perf`). `tests/support.rs` (node `tests`) and `src/state.rs` and the `Harness` of `src/lib.rs` (node `src`) are same-named decoys.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[test]]
name = "integration"
path = "tests/integration/suite.rs"

[[example]]
name = "viewer"
path = "demos/viewer/app.rs"

[[bench]]
name = "perf"
path = "perf/bench_main.rs"
```

```rust path=src/lib.rs
pub mod state;
pub struct Harness;
```

```rust path=src/state.rs
pub struct Model;
```

```rust path=tests/support.rs
pub struct Fixture;
```

```rust path=tests/integration/suite.rs
mod support;
mod cases;
pub struct TestServer;
```

```rust path=tests/integration/support/mod.rs
pub struct Fixture;
```

```rust path=tests/integration/cases/login.rs
use crate::support::Fixture;
use crate::TestServer;
```

```rust path=demos/viewer/app.rs
mod state;
mod panels;
```

```rust path=demos/viewer/state.rs
pub struct Model;
```

```rust path=demos/viewer/panels/list.rs
use crate::state::Model;
```

```rust path=perf/bench_main.rs
mod cases;
pub struct Harness;
```

```rust path=perf/cases/sort.rs
use crate::Harness;
```

## Expect

- tests/integration/suite.rs:1 -> node:support           # `mod support;` in the [[test]] crate root → tests/integration/support/mod.rs
- tests/integration/cases/login.rs:1 -> node:support     # crate:: from a module of the [[test]] crate → its tree tests/integration/, never tests/support.rs (node:tests)
- tests/integration/cases/login.rs:2 -> node:integration # a crate-root item → the [[test]] root tests/integration/suite.rs
- demos/viewer/panels/list.rs:1 -> node:viewer           # crate:: from a module of the [[example]] crate → demos/viewer/state.rs, never src/state.rs (node:src)
- perf/cases/sort.rs:1 -> node:perf                      # a crate-root item of the [[bench]] crate → perf/bench_main.rs, never the library's Harness in src/lib.rs (node:src)

## Why

A resolver that ignores these paths reads such a target's root as a module of another tree, so its `crate::` paths resolve to nothing, or to a same-named module or item of the library.
