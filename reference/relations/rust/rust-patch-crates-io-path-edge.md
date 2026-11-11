---
id: rust-patch-crates-io-path-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book, Overriding dependencies, The [patch] section (a `[patch.crates-io]` entry with `path` replaces the registry crate for the whole workspace)"
---

## Rule

`[dependencies] kit = "1"` and, in the same root manifest, `[patch.crates-io] kit = { path = "vendor/kit" }`: the build uses `vendor/kit`, so `use kit::Engine;` binds `vendor/kit/src/lib.rs` (owner vendored).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = "1"

[patch.crates-io]
kit = { path = "vendor/kit" }
```

```toml path=vendor/kit/Cargo.toml
[package]
name = "kit"
version = "1.0.0"
edition = "2021"
```

```rust path=vendor/kit/src/lib.rs owner=vendored
pub struct Engine;
```

```rust path=src/lib.rs owner=root
use kit::Engine;
```

## Expect

- src/lib.rs:1 -> node:vendored
