---
id: rust-top-level-use-list-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Use declarations (a use tree whose brace group has no path prefix, `use {a::X, b::Y};`, valid since Rust 2018)"
---

## Rule

A use tree may open with a brace group and no path prefix: `use {core_lib::Invoice, std::fmt::Debug};` imports two unrelated paths in one declaration, and some projects write every import this way. Each item carries its whole path, so each item is resolved on its own from the top level, exactly as a single `use` of that path would be: `core_lib::Invoice` names the in-repo path dependency `core-lib` and binds `crates/core-lib/src/lib.rs` (node `src`), while `std::fmt::Debug` is an external crate and stays silent. A nested group inside the brace list (`core_lib::{billing::Ledger, total}`) joins its items to its own prefix, so `core_lib::billing::Ledger` binds `crates/core-lib/src/billing/mod.rs` (node `billing`). Visibility changes nothing: `pub use {…};` resolves the same way.

## Files

```toml path=crates/core-lib/Cargo.toml
[package]
name = "core-lib"
```

```toml path=crates/app/Cargo.toml
[package]
name = "app"

[dependencies]
core-lib = { path = "../core-lib" }
```

```rust path=crates/core-lib/src/lib.rs
pub mod billing;
pub struct Invoice;
pub fn total() {}
```

```rust path=crates/core-lib/src/billing/mod.rs
pub struct Ledger;
```

```rust path=crates/app/src/cmd/run.rs
use {core_lib::Invoice, std::fmt::Debug};
use { core_lib::{billing::Ledger, total}, std::fmt::Display };
pub use {core_lib::total};
```

## Expect

- crates/core-lib/src/lib.rs:1 -> node:billing   # `pub mod billing;` in the library root
- crates/app/src/cmd/run.rs:1 -> node:src        # core_lib::Invoice → crates/core-lib/src/lib.rs; std::fmt::Debug is external, silent
- crates/app/src/cmd/run.rs:2 -> node:billing    # the nested group item core_lib::billing::Ledger → crates/core-lib/src/billing/mod.rs
- crates/app/src/cmd/run.rs:2 -> node:src        # the nested group item core_lib::total → crates/core-lib/src/lib.rs
- crates/app/src/cmd/run.rs:3 -> node:src        # a `pub use` brace list resolves like a `use` one

## Why

A brace list without a prefix is a different syntax node from a prefixed group, and an extractor that only knows the prefixed form drops every item of the declaration, losing whole crate dependencies in projects whose house style opens imports with `use {`.
