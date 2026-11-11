---
id: rust-patch-crates-io-git-dependency-silence
language: rust
category: import
expectation: silence
cites: "The Cargo Book, Overriding dependencies, The [patch] section (`[patch.crates-io]` replaces crates.io dependencies only)"
---

## Rule

`kit = { git = "https://example.com/kit" }` comes from a git repository, not from crates.io, so `[patch.crates-io] kit = { path = "vendor/kit" }` does not replace it: `use kit::Engine;` gives no edge.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { git = "https://example.com/kit" }

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

- silence
