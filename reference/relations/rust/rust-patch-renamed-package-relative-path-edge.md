---
id: rust-patch-renamed-package-relative-path-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book, Overriding dependencies, The [patch] section (a patch entry renamed with `package` replaces the package of that name; its `path` is relative to the manifest that writes the [patch])"
---

## Rule

The workspace root writes `[patch.crates-io] kitfork = { path = "vendor/kit", package = "kit" }`, which replaces the registry package `kit`. Member `crates/app` depends on `kit = "1"` and on `engine = { version = "1", package = "kit" }`; both are matched by the package name `kit`. The patch path is relative to the root manifest, so it binds `vendor/kit`, never `crates/app/vendor/kit`.

## Files

```toml path=Cargo.toml
[workspace]
members = ["crates/app"]

[patch.crates-io]
kitfork = { path = "vendor/kit", package = "kit" }
```

```toml path=crates/app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = "1"
engine = { version = "1", package = "kit" }
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

```toml path=crates/app/vendor/kit/Cargo.toml
[package]
name = "kit"
version = "1.0.0"
edition = "2021"
```

```rust path=crates/app/vendor/kit/src/lib.rs owner=decoy
pub struct Engine;
```

```rust path=crates/app/src/lib.rs owner=root
use kit::Engine;
use engine::Engine as E2;
```

## Expect

- crates/app/src/lib.rs:1 -> node:vendored
- crates/app/src/lib.rs:2 -> node:vendored
