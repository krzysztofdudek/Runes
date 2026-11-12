---
id: rust-autolib-off-lib-table-own-crate-name-from-bin-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `normalize_lib` (a `[lib]` table keeps the library when `autolib = false`; only its absence drops the inferred one)"
---

## Rule

An edition 2021 package named `app` writes `autolib = false` and also a `[lib]` table. The table declares the library, so the package has one at `src/lib.rs` and `app::…` reaches it from the bin: `use app::util::Thing;` binds `src/util/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
autolib = false

[lib]
```

```rust path=src/lib.rs
pub struct Marker;
pub mod util;
```

```rust path=src/util/mod.rs
pub struct Thing;
```

```rust path=src/main.rs
use app::util::Thing;
fn main() {}
```

## Expect

- src/lib.rs:2 -> node:util      # the `mod` that makes the file a module
- src/main.rs:1 -> node:util          # the `[lib]` table keeps the library, so the crate name still addresses it

## Why

`autolib = false` only switches off inferring a library. A written `[lib]` table is a library whatever the flag says, so the crate name must keep reaching it.
