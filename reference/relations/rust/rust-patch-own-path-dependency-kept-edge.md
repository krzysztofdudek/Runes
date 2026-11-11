---
id: rust-patch-own-path-dependency-kept-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book, Overriding dependencies, The [patch] section (a patch replaces a registry or git source; a dependency with a `path` of its own is not that source)"
---

## Rule

`kit = { version = "1", path = "local/kit" }` is a path dependency, so a `[patch.crates-io]` entry for `kit` does not replace it: `use kit::Engine;` binds `local/kit`, never the patched `vendor/kit`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { version = "1", path = "local/kit" }

[patch.crates-io]
kit = { path = "vendor/kit" }
```

```toml path=local/kit/Cargo.toml
[package]
name = "kit"
version = "1.0.0"
edition = "2021"
```

```rust path=local/kit/src/lib.rs owner=local
pub struct Engine;
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

- src/lib.rs:1 -> node:local
