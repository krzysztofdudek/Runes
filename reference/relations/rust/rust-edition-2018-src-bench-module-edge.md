---
id: rust-edition-2018-src-bench-module-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs normalize_benches, legacy_bench_path (the src/bench.rs root exists in edition 2015 only); Rust Reference, Modules"
---

## Rule

From edition 2018 on, a `[[bench]]` named `bench` with no path and no `benches/bench.rs` gets no legacy root, so `src/bench.rs` stays a module of the library: its `mod helpers;` is `src/bench/helpers.rs`, beside no root, and `src/lib.rs` declares it.

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

## Expect

- src/lib.rs:1 -> node:benchmod
- src/bench.rs:1 -> node:helpers
