---
id: rust-edition-2015-bench-file-exists-src-bench-module-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs normalize_benches, legacy_bench_path (src/bench.rs is the root of a bench named `bench` only when benches/bench.rs does not exist); Rust Reference, Modules"
---

## Rule

Edition 2015, `[[bench]] name = "bench"` with no path, and `benches/bench.rs` exists, so Cargo roots the bench there and `src/bench.rs` is no bench root. It is a module of the library, whose `mod helpers;` is looked for under `src/bench/`, where nothing lies, so no edge reaches the decoy `src/helpers/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "kit"

[[bench]]
name = "bench"
```

```rust path=src/lib.rs owner=lib
pub mod bench;
```

```rust path=src/bench.rs owner=benchmod
mod helpers;
```

```rust path=src/helpers/mod.rs
pub fn h() {}
```

```rust path=benches/bench.rs owner=benches
fn main() {}
```

## Expect

- src/lib.rs:1 -> node:benchmod
