---
id: rust-patch-member-manifest-ignored-silence
language: rust
category: import
expectation: silence
cites: "The Cargo Book, Overriding dependencies, The [patch] section (a [patch] in a manifest that is not the workspace root is ignored)"
---

## Rule

Member `app` writes `[patch.crates-io] kit = { path = "../vendor/kit" }` itself, but the workspace root does not. Cargo ignores a [patch] in a member manifest, so `kit = "1"` stays the registry crate and `use kit::Engine;` gives no edge.

## Files

```toml path=Cargo.toml
[workspace]
members = ["app"]
```

```toml path=app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = "1"

[patch.crates-io]
kit = { path = "../vendor/kit" }
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

- silence
