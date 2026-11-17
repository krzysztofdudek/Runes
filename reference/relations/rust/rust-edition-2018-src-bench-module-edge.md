---
id: rust-edition-2018-src-bench-module-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs normalize_benches, legacy_bench_path (the src/bench.rs root exists in edition 2015 only); Rust Reference, Modules"
---

## Rule

From edition 2018 on, a `[[bench]]` named `bench` with no path is rooted at `benches/bench.rs` (or `benches/bench/main.rs`) and never at the legacy `src/bench.rs`, so `src/bench.rs` stays a module of the library: its `mod helpers;` is `src/bench/helpers.rs`, beside no root, and `src/lib.rs` declares it.

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2018"

[[bench]]
name = "bench"
```

```rust path=src/lib.rs owner=lib
pub mod bench;
```

```rust path=src/bench.rs owner=benchmod
mod helpers;
```

```rust path=src/bench/helpers.rs owner=helpers
pub fn h() {}
```

```rust path=src/helpers/mod.rs owner=decoy
pub fn h() {}
```

```rust path=benches/bench.rs owner=benches
fn main() {}
```

## Expect

- src/lib.rs:1 -> node:benchmod
- src/bench.rs:1 -> node:helpers

## Why

Cargo refuses an edition 2018 package whose bench `bench` has no file under `benches/`, so the case gives it `benches/bench.rs`. Edition 2015 roots that bench at `src/bench.rs` only where `benches/bench.rs` is missing, so in a package that builds the two editions agree; what the case keeps is the library module a legacy reading would take for a root, and its `mod helpers;`, which a root would look for beside it, in the decoy.
