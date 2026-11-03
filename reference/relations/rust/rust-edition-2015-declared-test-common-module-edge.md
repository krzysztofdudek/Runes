---
id: rust-edition-2015-declared-test-common-module-edge
language: rust
category: trap
expectation: edge
cites: "The Cargo Book — Cargo Targets, Target auto-discovery: \"For packages with the 2015 edition, the default for auto-discovery is `false` if at least one target is manually defined in `Cargo.toml`.\"; Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `toml_targets_and_inferred`; Rust Reference — Modules (a module belongs to the crate whose root declares it)"
---

## Rule

An edition 2015 package (it gives no `edition`) declares one `[[test]]`, `tests/tests.rs`, and writes no `autotests`, so Cargo discovers no other test crate in `tests/`. The helper `tests/common/mod.rs` can then only be a module of `tests/tests.rs`, the one test root in its directory, and `use crate::Dir;` in it binds `tests/tests.rs` (node `tests`). Under edition 2018 every `tests/*.rs` is a test crate that may declare the helper, which leaves it silent (`rust-target-paths-shared-dir-silence`).

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[test]]
name = "integration"
path = "tests/tests.rs"
```

```rust path=src/lib.rs
pub struct Dir;
```

```rust path=tests/tests.rs
mod common;
pub struct Dir;
```

```rust path=tests/other.rs
fn main() {}
```

```rust path=tests/common/mod.rs
use crate::Dir;
```

## Expect

- tests/tests.rs:1 -> node:common            # `mod common;` → tests/common/mod.rs
- tests/common/mod.rs:1 -> node:tests        # the one declared test root in tests/ is the helper's crate, not src/lib.rs (node:src)

## Why

Cargo's `toml_targets_and_inferred` turns test discovery off in edition 2015 when a `[[test]]` is written (`if edition == Edition::Edition2015 { … false }`), so `tests/other.rs` is no test crate and no rival owner of the helper. Leaving the helper silent there loses the edge to the one crate that compiles it.
