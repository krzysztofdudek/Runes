---
id: rust-edition-inline-workspace-declared-bin-main-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs toml_targets_and_inferred (from edition 2018 on, a declared [[bin]] leaves auto-discovery on); The Cargo Book, The [workspace] section (`edition = { workspace = true }`)"
---

## Rule

Member `app` writes `edition = { workspace = true }` and the workspace says 2021, with `[[bin]] name = "admin" path = "tools/admin.rs"`. In 2021 the auto-discovered `src/bin/worker/main.rs` stays a binary, so its `mod jobs;` is `src/bin/worker/jobs/mod.rs` (node jobs) and `crate::jobs::Run` from the root the same file.

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

[[bin]]
name = "admin"
path = "tools/admin.rs"
```

```rust path=app/tools/admin.rs
fn main() {}
```

```rust path=app/src/bin/worker/main.rs
mod jobs;
use crate::jobs::Run;
fn main() {}
```

```rust path=app/src/bin/worker/jobs/mod.rs
pub struct Run;
```

## Expect

- app/src/bin/worker/main.rs:1 -> node:jobs
- app/src/bin/worker/main.rs:2 -> node:jobs
