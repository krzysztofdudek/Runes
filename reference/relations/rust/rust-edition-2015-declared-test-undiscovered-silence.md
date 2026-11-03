---
id: rust-edition-2015-declared-test-undiscovered-silence
language: rust
category: trap
expectation: silence
cites: "The Cargo Book — Cargo Targets, Target auto-discovery: \"For packages with the 2015 edition, the default for auto-discovery is `false` if at least one target is manually defined in `Cargo.toml`.\"; Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `toml_targets_and_inferred`, shared by bins, tests, examples and benches"
---

## Rule

A package that gives no `edition` is edition 2015. When it declares a `[[test]]` and writes no `autotests`, Cargo builds only the declared test; `tests/smoke.rs`, which no `[[test]]` names, is not discovered, so it is no crate root. `use self::helpers::Fixture;` in it binds nothing, not `tests/helpers/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[test]]
name = "integration"
path = "suites/integration.rs"
```

```rust path=src/lib.rs
pub struct Thing;
```

```rust path=suites/integration.rs
fn main() {}
```

```rust path=tests/smoke.rs
use self::helpers::Fixture;
```

```rust path=tests/helpers/mod.rs
pub struct Fixture;
```

## Expect

- silence      # edition 2015 with a declared [[test]] turns test auto-discovery off: tests/smoke.rs is no crate root, so `self::helpers` is not tests/helpers/mod.rs

## Why

Cargo applies one rule to every kind of target. In `toml_targets_and_inferred`, when the manifest writes the kind's array and no `auto…` flag, the flag defaults to `if edition == Edition::Edition2015 { … false } else { true }`, and only `if autodiscover { targets.append(&mut rem_targets); }` adds the inferred files; `normalize_tests` calls it through `normalize_targets` with `"autotests"`. Reading `tests/smoke.rs` as a test crate gives edges from a file Cargo does not compile.
