---
id: rust-patch-renamed-package-relative-path-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book, Overriding dependencies, The [patch] section (a patch entry renamed with `package` replaces the package of that name; its `path` is relative to the manifest that writes the [patch])"
---

## Rule

The workspace root writes `[patch.crates-io] kitfork = { path = "vendor/kit", package = "kit" }`, which replaces the registry package `kit`. Member `crates/app` depends on `kit = "1"`, and member `crates/tool` on `engine = { version = "1", package = "kit" }`; both are matched by the package name `kit`. The patch path is relative to the root manifest, so it binds `vendor/kit`, never `crates/app/vendor/kit`.

## Files

```toml path=Cargo.toml
[workspace]
members = ["crates/app", "crates/tool"]

[patch.crates-io]
kitfork = { path = "vendor/kit", package = "kit" }
```

```toml path=crates/app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = "1"
```

```toml path=crates/tool/Cargo.toml
[package]
name = "tool"
edition = "2021"

[dependencies]
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
```

```rust path=crates/tool/src/lib.rs owner=tool
use engine::Engine;
```

## Expect

- crates/app/src/lib.rs:1 -> node:vendored
- crates/tool/src/lib.rs:1 -> node:vendored

## Why

A patch path read from the member that depends on the crate binds a same-named copy beside that member, a wrong target. The two renamed dependencies sit in two members because Cargo refuses one package that depends on the same crate under two names.
