---
id: rust-edition-2015-declared-bench-undiscovered-silence
language: rust
category: trap
expectation: silence
cites: "The Cargo Book — Cargo Targets, Target auto-discovery: \"For packages with the 2015 edition, the default for auto-discovery is `false` if at least one target is manually defined in `Cargo.toml`.\"; Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `toml_targets_and_inferred`, shared by bins, tests, examples and benches"
---

## Rule

A package that gives no `edition` is edition 2015. When it declares a `[[bench]]` and writes no `autobenches`, Cargo builds only the declared bench; `benches/parse.rs`, which no `[[bench]]` names, is not discovered, so it is no crate root. `use self::inputs::Corpus;` in it binds nothing, not `benches/inputs/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[bench]]
name = "speed"
path = "perf/speed.rs"
```

```rust path=src/lib.rs
pub struct Thing;
```

```rust path=perf/speed.rs
fn main() {}
```

```rust path=benches/parse.rs
use self::inputs::Corpus;
```

```rust path=benches/inputs/mod.rs
pub struct Corpus;
```

## Expect

- silence      # edition 2015 with a declared [[bench]] turns bench auto-discovery off: benches/parse.rs is no crate root, so `self::inputs` is not benches/inputs/mod.rs

## Why

Cargo applies one rule to every kind of target. In `toml_targets_and_inferred`, when the manifest writes the kind's array and no `auto…` flag, the flag defaults to `if edition == Edition::Edition2015 { … false } else { true }`, and only `if autodiscover { targets.append(&mut rem_targets); }` adds the inferred files; `normalize_benches` calls it through `normalize_targets_with_legacy_path` with `"autobenches"`. Reading `benches/parse.rs` as a bench crate gives edges from a file Cargo does not compile.
