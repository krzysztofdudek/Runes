---
id: rust-autotests-off-test-module-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Target auto-discovery (`autotests = false` in [package] turns off discovery of tests/*.rs; only declared [[test]] targets remain); Rust Reference — Modules (a non-root module file resolves `mod` in the directory named after it); Runes issue 181"
---

## Rule

With `autotests = false` (ripgrep's manifest), the files of `tests/` are no test crates of their own: only the declared `[[test]]` is, and every other file there is a module of it. So `tests/feature.rs` is the module `feature` of `tests/tests.rs`, and its `mod cases;` names `tests/feature/cases.rs` (node `feature`), never `tests/cases.rs`; in `tests/feature/cases.rs`, `crate::Dir` binds the test root `tests/tests.rs` and `crate::util::TestCommand` binds `tests/util.rs` (node `tests`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
autotests = false

[[test]]
name = "integration"
path = "tests/tests.rs"
```

```rust path=src/lib.rs
pub struct Dir;
```

```rust path=tests/tests.rs
mod util;
mod feature;
pub struct Dir;
```

```rust path=tests/util.rs
pub struct TestCommand;
```

```rust path=tests/feature.rs
mod cases;
```

```rust path=tests/feature/cases.rs
use crate::util::TestCommand;
use crate::Dir;
```

```rust path=tests/cases.rs
pub struct Decoy;
```

## Expect

- tests/feature.rs:1 -> node:feature        # `mod cases;` in the module `feature` → tests/feature/cases.rs, never tests/cases.rs
- tests/feature/cases.rs:1 -> node:tests    # crate:: of the one test crate → tests/util.rs
- tests/feature/cases.rs:2 -> node:tests    # a crate-root item → the declared test root tests/tests.rs

## Why

Reading every `tests/*.rs` as its own crate root, as auto-discovery would, puts a module's `mod` children beside it instead of in its own directory and leaves its `crate::` items unbound.
