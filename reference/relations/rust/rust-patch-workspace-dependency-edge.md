---
id: rust-patch-workspace-dependency-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book, Overriding dependencies, The [patch] section; Workspaces, The dependencies table (`{ workspace = true }` inherits a registry dependency from [workspace.dependencies])"
---

## Rule

The workspace root declares `kit = "1"` in `[workspace.dependencies]` and patches it with `[patch.crates-io] kit = { path = "vendor/kit" }`. Member `app` inherits it with `kit = { workspace = true }`, so `use kit::Engine;` binds `vendor/kit`.

## Files

```toml path=Cargo.toml
[workspace]
members = ["app"]

[workspace.dependencies]
kit = "1"

[patch.crates-io]
kit = { path = "vendor/kit" }
```

```toml path=app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { workspace = true }
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
