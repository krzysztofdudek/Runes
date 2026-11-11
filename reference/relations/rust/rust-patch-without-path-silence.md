---
id: rust-patch-without-path-silence
language: rust
category: import
expectation: silence
cites: "The Cargo Book, Overriding dependencies, The [patch] section (a patch entry may name a git source or a version instead of a path)"
---

## Rule

`[patch.crates-io] kit = { git = "https://example.com/kit" }` replaces `kit` with a git checkout, which is not in the repository. A patch entry without a `path` leaves the dependency external, so `use kit::Engine;` gives no edge even though a same-named crate lies in `vendor/kit`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = "1"

[patch.crates-io]
kit = { git = "https://example.com/kit" }
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
