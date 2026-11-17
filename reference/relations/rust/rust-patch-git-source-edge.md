---
id: rust-patch-git-source-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book, Overriding dependencies, The [patch] section (`[patch.\"<url>\"]` replaces a dependency from that git repository; `[patch.<registry>]` one from that registry)"
---

## Rule

A patch table is named for the source it replaces. `git_kit = { git = "https://example.com/kit" }` is replaced by `[patch."https://example.com/kit"]`, and `corp_kit = { version = "1", registry = "corp" }` by `[patch.corp]`; each binds its patched path. `crates_kit = "1"` comes from crates.io, which neither table names, so it stays external.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
git_kit = { git = "https://example.com/kit", package = "kit" }
corp_kit = { version = "1", registry = "corp", package = "kit" }
crates_kit = { version = "1", package = "kit" }

[patch."https://example.com/kit"]
kit = { path = "vendor/git" }

[patch.corp]
kit = { path = "vendor/corp" }
```

```toml path=vendor/git/Cargo.toml
[package]
name = "kit"
version = "1.0.0"
edition = "2021"
```

```rust path=vendor/git/src/lib.rs owner=gitkit
pub struct Engine;
```

```toml path=vendor/corp/Cargo.toml
[package]
name = "kit"
version = "1.1.0"
edition = "2021"
```

```rust path=vendor/corp/src/lib.rs owner=corpkit
pub struct Engine;
```

```rust path=src/lib.rs owner=root
use git_kit::Engine;
use corp_kit::Engine as E2;
use crates_kit::Engine as E3;
```

## Expect

- src/lib.rs:1 -> node:gitkit
- src/lib.rs:2 -> node:corpkit
