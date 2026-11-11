---
id: rust-edition-2015-legacy-bench-path-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs normalize_benches (legacy_bench_path: src/bench.rs for a bench named `bench`, edition 2015)"
---

## Rule

Edition 2015, `[[bench]] name = "bench"` with no path and no `benches/bench.rs`: Cargo roots it at `src/bench.rs`. Its `mod helpers;` is then `src/helpers/mod.rs` (beside the root), not `src/bench/helpers.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "kit"

[[bench]]
name = "bench"
```

```rust path=src/lib.rs owner=lib
pub fn f() {}
```

```rust path=src/bench.rs owner=benchroot
mod helpers;
fn main() {}
```

```rust path=src/helpers/mod.rs
pub fn h() {}
```

## Expect

- src/bench.rs:1 -> node:helpers
