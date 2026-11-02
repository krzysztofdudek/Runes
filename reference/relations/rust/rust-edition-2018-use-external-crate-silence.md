---
id: rust-edition-2018-use-external-crate-silence
language: rust
category: trap
expectation: silence
cites: "The Rust Edition Guide — Path and module system changes (from edition 2018 a `use` path starts with `crate`, `self`, `super` or the name of a crate); The Cargo Book — the `edition` key"
---

## Rule

The control of `rust-edition-2015-use-crate-root-relative-edge`: the same files with `edition = "2018"` in `[package]`. From edition 2018 on a `use` path whose leading segment is not `crate`, `self` or `super` starts with a crate name, so `use shapes::Circle;` names an external crate `shapes` and gives no edge, even though the root declares a module of that name (the module is reached only as `crate::shapes`).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2018"
```

```rust path=src/lib.rs
mod shapes;
```

```rust path=src/shapes.rs
pub struct Circle;
```

```rust path=src/api/client.rs
use shapes::Circle;
```

## Expect

- silence      # edition 2018: a bare first segment is an external crate, never the crate root's module

## Why

Reading every bare `use` path as root-relative would mis-bind external crates to same-named in-repo modules in every modern crate.
