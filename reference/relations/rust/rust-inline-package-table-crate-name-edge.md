---
id: rust-inline-package-table-crate-name-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — The Manifest Format (`[package]` `name`; the `[lib]` target's `name` and `path`); TOML 1.0 — Inline Tables (`package = { name = \"kit\" }` defines the same table as `[package]` holding `name = \"kit\"`); Runes issue 173"
---

## Rule

`[package]` and `[lib]` can be written as inline tables: `package = { name = "text-util" }` is the same table as `[package]` holding that name, and `lib = { name = "kit_api", path = "api/lib.rs" }` the same as the `[lib]` table. So the crate names and the library path they give resolve as the table forms do. A dependency on `crates/kit` is called `kit_api` in code, the name of its library: `kit_api::Client` binds `crates/kit/api/lib.rs` (node `api`) from the package `app` and from kit's own test, while `kit::Client` names no crate (line 2), and kit's `src/lib.rs` (node `src`) is a decoy. In `crates/util`, whose name `text-util` is written inline, `text_util::slug` from its test binds its library `crates/util/src/lib.rs` (node `src`).

## Files

```toml path=crates/kit/Cargo.toml
package = { name = "kit", version = "0.1.0" }
lib = { name = "kit_api", path = "api/lib.rs" }
```

```toml path=crates/util/Cargo.toml
package = { name = "text-util" }
```

```toml path=crates/app/Cargo.toml
[package]
name = "app"

[dependencies]
kit = { path = "../kit" }
```

```rust path=crates/kit/api/lib.rs
pub struct Client;
```

```rust path=crates/kit/src/lib.rs
pub struct Client;
```

```rust path=crates/kit/tests/smoke.rs
use kit_api::Client;
```

```rust path=crates/util/src/lib.rs
pub fn slug() {}
```

```rust path=crates/util/tests/it.rs
use text_util::slug;
```

```rust path=crates/app/src/cmd/run.rs
use kit_api::Client;
use kit::Client;
```

## Expect

- crates/app/src/cmd/run.rs:1 -> node:api    # the dependency's library name from `lib = { name = … }` → its path from the same inline table, crates/kit/api/lib.rs
- crates/kit/tests/smoke.rs:1 -> node:api    # the package's own library name → its library, from its test crate
- crates/util/tests/it.rs:1 -> node:src      # the package name from `package = { name = … }` → crates/util/src/lib.rs; run.rs line 2 (`kit::`, no crate of that name) stays silent, never kit's src/lib.rs (node:src)

## Why

A reader that finds `name` and `path` only under the `[package]` and `[lib]` headers reads an inline package as nameless: the crate's own name stops resolving, and its dependents address it by the dependency's key, binding a library root it does not use.
