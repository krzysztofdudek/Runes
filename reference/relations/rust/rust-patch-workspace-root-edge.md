---
id: rust-patch-workspace-root-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book, Overriding dependencies ([patch] is read only from the workspace root manifest and applies to every member)"
---

## Rule

A virtual workspace root carries `[patch.crates-io] kit = { path = "vendor/kit" }`; member `app` depends on `kit = "1"`. In `app`, `use kit::Engine;` binds `vendor/kit/src/lib.rs` (owner vendored).

## Files

```toml path=Cargo.toml
[workspace]
members = ["app"]

[patch.crates-io]
kit = { path = "vendor/kit" }
```

```toml path=app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = "1"
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

```rust path=app/src/lib.rs owner=root
use kit::Engine;
```

## Expect

- app/src/lib.rs:1 -> node:vendored
