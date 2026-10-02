---
id: rust-inline-dependency-table-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Specifying dependencies (path dependencies, inheriting a dependency from a workspace); TOML 1.0 — Inline Tables (`dependencies = { util = { path = \"../util\" } }` defines the same table as `[dependencies]` with `util = { path = \"../util\" }`); Runes issue 163"
---

## Rule

A dependency table can be written as one inline table on its key: `dependencies = { util = { path = "../util" }, serde = "1" }` defines the same table as `[dependencies]` holding those two entries, and `workspace = { dependencies = { shop-core = { path = "crates/core" } } }` the same `[workspace.dependencies]`. So these forms resolve exactly as the table forms do. `crates/app/Cargo.toml` declares `util` by path and inherits `shop-core` with `{ workspace = true }`, all in one inline table; the root manifest writes `[workspace]` inline as well. `shop_core::Order` binds `crates/core/src/lib.rs` (node `src`), and `util::text::slug` binds `crates/util/src/text/mod.rs` (node `text`). The registry dependency `serde` stays external and silent (line 3).

## Files

```toml path=Cargo.toml
workspace = { members = ["crates/*"], dependencies = { shop-core = { path = "crates/core" } } }
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
dependencies = { shop-core = { workspace = true }, util = { path = "../util" }, serde = "1" }

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

- crates/app/src/cmd/run.rs:1 -> node:src     # shop_core (`{ workspace = true }` inside the inline `dependencies` table, inherited from the inline `workspace` table) → crates/core/src/lib.rs
- crates/app/src/cmd/run.rs:2 -> node:text    # util (`{ path = "../util" }` inside the inline `dependencies` table) → crates/util/src/text/mod.rs

## Why

A manifest reader that finds dependency entries only below a key that names the table misses the same entries when the table itself is written inline, so every import of such a crate is silently dropped and an undeclared dependency between crates passes the check.
