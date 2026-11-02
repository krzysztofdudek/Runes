---
id: rust-bin-edition-2018-in-2015-package-silence
language: rust
category: import
expectation: silence
cites: "The Cargo Book — Cargo Targets, the `edition` field of a target (it overrides the package's edition for that target); The Rust Edition Guide — Path and module system changes (from edition 2018 a bare first segment of a `use` path names a crate)"
---

## Rule

The reverse of a 2015 binary in a 2018 package: the package is edition 2015 and its only binary sets `edition = "2018"`. The binary's files read paths the 2018 way, so from `src/api/client.rs` `use shapes::Circle;` names an external crate `shapes`, never the module `shapes` of the crate root, and gives no edge.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2015"

[[bin]]
name = "app"
path = "src/main.rs"
edition = "2018"
```

```rust path=src/main.rs
mod shapes;
```

```rust path=src/shapes.rs
pub struct Circle;
```

```rust path=src/api/client.rs
use shapes::Circle;
```

## Expect

- silence      # the bin is edition 2018: a bare first segment is an external crate, never the crate root's module

## Why

Reading only `[package].edition` takes the bin for edition 2015 and binds a same-named in-repo module to what is an external crate in that binary.
