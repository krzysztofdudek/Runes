---
id: rust-edition-2015-empty-bin-array-main-silence
language: rust
category: trap
expectation: silence
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `toml_targets_and_inferred` (a written target array, even an empty one, is `Some(targets)`, and in edition 2015 with no flag discovery is off); The Cargo Book — Cargo Targets, Target auto-discovery"
---

## Rule

A package that gives no `edition` is edition 2015. `bin = []` writes the bin array with no element, and Cargo reads that as declaring bins: with no `autobins`, bin auto-discovery is off, so `src/main.rs` is no binary and belongs to no crate. `use self::tools::Helper;` in it binds nothing.

## Files

```toml path=Cargo.toml
bin = []

[package]
name = "app"
```

```rust path=src/lib.rs
pub struct Thing;
```

```rust path=src/main.rs
use self::tools::Helper;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

## Expect

- silence      # edition 2015 with `bin = []` turns bin auto-discovery off: src/main.rs is no crate root, so `self::tools` is not src/tools/mod.rs

## Why

In `toml_targets_and_inferred` only `None => { if let Some(false) = autodiscover { vec![] } else { inferred_targets } }` keeps the inferred bins when no flag is written; an empty array takes the `Some(targets)` arm, where the flag defaults to `if edition == Edition::Edition2015 { … false }`, and nothing appends the inferred `src/main.rs`. Reading it as a binary gives edges from a file Cargo does not compile.
