---
id: rust-edition-2015-autobins-true-main-edge
language: rust
category: trap
expectation: edge
cites: "The Cargo Book — Cargo Targets, Target auto-discovery: \"For packages with the 2015 edition, the default for auto-discovery is `false` if at least one target is manually defined in `Cargo.toml`.\" The key `autobins` set in `[package]` overrides that default."
---

## Rule

In an edition 2015 package that declares a `[[bin]]`, writing `autobins = true` keeps bin auto-discovery on, so `src/main.rs` is a crate root and `use self::tools::Helper;` in it reaches `src/tools/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
autobins = true

[[bin]]
name = "cli"
path = "cli/main.rs"
```

```rust path=src/lib.rs
pub mod util;
```

```rust path=src/util.rs
pub struct Thing;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

```rust path=src/main.rs
use self::tools::Helper;
```

```rust path=cli/main.rs
fn main() {}
```

## Expect

- src/main.rs:1 -> node:tools          # autobins = true keeps discovery on in edition 2015: src/main.rs is a crate root

## Why

The explicit key is the one thing that overrides the edition 2015 default, so reading the default alone would drop real edges of a package that opted back in.
