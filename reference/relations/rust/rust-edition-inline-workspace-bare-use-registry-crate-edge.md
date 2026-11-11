---
id: rust-edition-inline-workspace-bare-use-registry-crate-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book, The [workspace] section (`edition.workspace = true`, the same key as `edition = { workspace = true }` in TOML); Rust Reference, Use declarations (edition 2018 on, a bare first segment is a crate or a name in scope)"
---

## Rule

A member writes `edition = { workspace = true }` (the inline-table spelling of `edition.workspace = true`) and the workspace says `edition = "2021"`. The member is edition 2021, so in `src/api/client.rs` `use config::Config;` names the registry crate `config`, never the root's module `config` (`src/config/mod.rs`, node config): the file gives no edge, and only the root's own `mod config;` stays an edge.

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
config = "0.14"
```

```rust path=app/src/lib.rs
mod config;
mod api;
```

```rust path=app/src/config/mod.rs
pub struct Config;
```

```rust path=app/src/api/client.rs
use config::Config;
```

## Expect

- app/src/lib.rs:1 -> node:config
