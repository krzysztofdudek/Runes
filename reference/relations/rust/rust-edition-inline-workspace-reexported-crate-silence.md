---
id: rust-edition-inline-workspace-reexported-crate-silence
language: rust
category: import
expectation: silence
cites: "The Cargo Book, The [workspace] section (`edition = { workspace = true }`); Rust Reference, Use declarations (2018 on: a bare first segment in a submodule is a crate)"
---

## Rule

Member `app` writes `edition = { workspace = true }` (the workspace says 2021). Its root re-exports a registry crate, `pub use tokio;`, and declares `mod jobs;`. In `src/jobs/mod.rs`, `use tokio::spawn;` names the registry crate `tokio`, never the root file `src/lib.rs` (owner root): that edge would also close a cycle with the root's `mod jobs;`.

## Files

```toml path=Cargo.toml
[workspace]
members = ["app"]

[workspace.package]
edition = "2021"
```

```toml path=app/Cargo.toml
[package]
name = "app"
edition = { workspace = true }

[dependencies]
tokio = "1"
```

```rust path=app/src/lib.rs owner=root
pub use tokio;
mod jobs;
```

```rust path=app/src/jobs/mod.rs
use tokio::spawn;
```

## Expect

- app/src/lib.rs:2 -> node:jobs
