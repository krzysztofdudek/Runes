---
id: rust-edition-inline-workspace-declared-bench-main-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs toml_targets_and_inferred (2018 on, a declared [[bench]] leaves bench discovery on); the common criterion shape `[[bench]] name = ... harness = false`"
---

## Rule

Member `app`, edition 2021 through `edition = { workspace = true }`, declares the criterion bench `[[bench]] name = "parse" harness = false`. The bench `benches/render/main.rs` is still auto-discovered, so its `mod helpers;` is `benches/render/helpers/mod.rs` (node helpers).

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

[[bench]]
name = "parse"
harness = false
```

```rust path=app/src/lib.rs owner=root
pub fn f() {}
```

```rust path=app/benches/parse.rs owner=parse
fn main() {}
```

```rust path=app/benches/render/main.rs owner=render
mod helpers;
fn main() {}
```

```rust path=app/benches/render/helpers/mod.rs
pub fn h() {}
```

## Expect

- app/benches/render/main.rs:1 -> node:helpers
