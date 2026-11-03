---
id: rust-test-declared-name-drops-inferred-test-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `toml_targets_and_inferred`: the same `seen_names` rule drops an inferred test (`tests/<name>.rs`, `tests/<name>/main.rs`) whose name a declared `[[test]]` has"
---

## Rule

In an edition 2021 package, `[[test]] name = "api" path = "checks/api.rs"` declares a test. The file `tests/api.rs` would be inferred as a test of the same name, so Cargo leaves it out: it is no crate root, and `use self::support::Tool;` in it reaches nothing. The declared file `checks/api.rs` is the root.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[[test]]
name = "api"
path = "checks/api.rs"
```

```rust path=checks/api.rs
use self::parts::Part;
```

```rust path=checks/parts/mod.rs
pub struct Part;
```

```rust path=tests/api.rs
use self::support::Tool;
```

```rust path=tests/support/mod.rs
pub struct Tool;
```

## Expect

- checks/api.rs:1 -> node:parts          # the declared test is rooted at its path; tests/api.rs shares its name and is dropped

## Why

The rule is the same for every kind of target Cargo infers: a declared name takes the inferred one's place, so the inferred file is read as no crate root.
