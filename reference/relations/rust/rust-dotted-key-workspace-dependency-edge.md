---
id: rust-dotted-key-workspace-dependency-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Specifying dependencies (inheriting a dependency from a workspace, written `foo.workspace = true`); TOML 1.0 — Keys (a dotted key `a.b = v` defines the same table as `a = { b = v }`)"
---

## Rule

TOML lets a dependency entry be written with dotted keys instead of an inline table, and the Cargo Book's own workspace inheritance example uses that form: `shop-core.workspace = true` is the same entry as `shop-core = { workspace = true }`, and `shop-core.path = "crates/core"` the same as `shop-core = { path = "crates/core" }`. So the dotted form resolves exactly as the inline form does. `crates/app/Cargo.toml` inherits `shop-core` with `shop-core.workspace = true`; the root `[workspace.dependencies]` gives its path with `shop-core.path = "crates/core"`; code names the crate `shop_core`, and `shop_core::Order` binds `crates/core/src/lib.rs` (node `src`). In `[dev-dependencies]`, `util.path = "../util"` is a direct path dependency, and `util::text::slug` binds `crates/util/src/text/mod.rs` (node `text`). A registry dependency written dotted (`serde.version = "1"`) stays external and silent (line 3).

## Files

```toml path=Cargo.toml
[workspace]
members = ["crates/*"]

[workspace.dependencies]
shop-core.path = "crates/core"
```

```toml path=crates/core/Cargo.toml
[package]
name = "shop-core"
```

```toml path=crates/util/Cargo.toml
[package]
name = "util"
```

```toml path=crates/app/Cargo.toml
[package]
name = "app"

[dependencies]
shop-core.workspace = true
serde.version = "1"

[dev-dependencies]
util.path = "../util"
```

```rust path=crates/core/src/lib.rs
pub struct Order;
```

```rust path=crates/util/src/text/mod.rs
pub fn slug() {}
```

```rust path=crates/app/src/cmd/run.rs
use shop_core::Order;
use util::text::slug;
use serde::Serialize;
```

## Expect

- crates/app/src/cmd/run.rs:1 -> node:src     # shop_core (dotted `.workspace = true`, inherited from a dotted `.path` in the workspace) → crates/core/src/lib.rs
- crates/app/src/cmd/run.rs:2 -> node:text    # util (dotted `.path` in [dev-dependencies]) → crates/util/src/text/mod.rs

## Why

Large Rust workspaces write member dependencies as `name.workspace = true`, one per line. A manifest reader that takes `shop-core.workspace` for the name of a dependency finds neither a path nor workspace inheritance for `shop-core`, so every import of that crate is silently dropped and an undeclared dependency between crates passes the check.
