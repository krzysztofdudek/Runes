---
id: rust-root-dotted-dependency-key-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Specifying dependencies (path dependencies, inheriting a dependency from a workspace); TOML 1.0 — Keys and Tables (a dotted key `a.b.c = v` written above the first table header, or inside `[a]`, defines the same table as `[a.b]` with `c = v`)"
---

## Rule

A dotted key can name the dependency table itself, not only the crate inside it: written above the first table header, `dependencies.util.path = "../util"` is the same entry as `util = { path = "../util" }` under `[dependencies]`, and inside `[workspace]`, `dependencies.shop-core.path = "crates/core"` is the same entry as `shop-core = { path = "crates/core" }` under `[workspace.dependencies]`. So these forms resolve exactly as the table forms do. The root manifest gives `shop-core` its path from inside `[workspace]`; `crates/app/Cargo.toml` inherits it with `dependencies.shop-core.workspace = true` and declares `util` with `dependencies.util.path = "../util"`, both above `[package]`. Code names the crates `shop_core` and `util`: `shop_core::Order` binds `crates/core/src/lib.rs` (node `src`), and `util::text::slug` binds `crates/util/src/text/mod.rs` (node `text`). A registry dependency written the same way (`dependencies.serde.version = "1"`) stays external and silent (line 3).

## Files

```toml path=Cargo.toml
[workspace]
members = ["crates/*"]
dependencies.shop-core.path = "crates/core"
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
dependencies.shop-core.workspace = true
dependencies.util.path = "../util"
dependencies.serde.version = "1"

[package]
name = "app"
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

- crates/app/src/cmd/run.rs:1 -> node:src     # shop_core (`dependencies.shop-core.workspace = true` above the first header, inherited from `dependencies.shop-core.path` inside [workspace]) → crates/core/src/lib.rs
- crates/app/src/cmd/run.rs:2 -> node:text    # util (`dependencies.util.path` above the first header) → crates/util/src/text/mod.rs

## Why

A manifest reader that looks for dependency entries only under a `[dependencies]` or `[workspace.dependencies]` header misses the same entries written one level up in the TOML tree, so every import of such a crate is silently dropped and an undeclared dependency between crates passes the check.
