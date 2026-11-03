---
id: rust-edition-2015-declared-example-undiscovered-silence
language: rust
category: trap
expectation: silence
cites: "The Cargo Book — Cargo Targets, Target auto-discovery: \"For packages with the 2015 edition, the default for auto-discovery is `false` if at least one target is manually defined in `Cargo.toml`.\"; Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `toml_targets_and_inferred`, shared by bins, tests, examples and benches"
---

## Rule

A package that gives no `edition` is edition 2015. When it declares an `[[example]]` and writes no `autoexamples`, Cargo builds only the declared example; `examples/demo.rs`, which no `[[example]]` names, is not discovered, so it is no crate root. `use self::support::Window;` in it binds nothing, not `examples/support/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[example]]
name = "tour"
path = "samples/tour.rs"
```

```rust path=src/lib.rs
pub struct Thing;
```

```rust path=samples/tour.rs
fn main() {}
```

```rust path=examples/demo.rs
use self::support::Window;
```

```rust path=examples/support/mod.rs
pub struct Window;
```

## Expect

- silence      # edition 2015 with a declared [[example]] turns example auto-discovery off: examples/demo.rs is no crate root, so `self::support` is not examples/support/mod.rs

## Why

Cargo applies one rule to every kind of target. In `toml_targets_and_inferred`, when the manifest writes the kind's array and no `auto…` flag, the flag defaults to `if edition == Edition::Edition2015 { … false } else { true }`, and only `if autodiscover { targets.append(&mut rem_targets); }` adds the inferred files; `normalize_examples` calls it through `normalize_targets` with `"autoexamples"`. Reading `examples/demo.rs` as an example crate gives edges from a file Cargo does not compile.
