---
id: rust-edition-2018-declared-bin-main-edge
language: rust
category: trap
expectation: edge
cites: "The Cargo Book — Cargo Targets, Target auto-discovery: \"For packages with the 2015 edition, the default for auto-discovery is `false` if at least one target is manually defined in `Cargo.toml`. Beginning with the 2018 edition, the default is always `true`.\""
---

## Rule

From edition 2018 on auto-discovery is on whatever the manifest declares, so `src/main.rs` stays a crate root next to a declared `[[bin]]`. `use self::tools::Helper;` in it reaches `src/tools/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2018"

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

- src/main.rs:1 -> node:tools          # edition 2018: bin auto-discovery stays on, src/main.rs is a crate root and `self::tools` is src/tools/mod.rs

## Why

The control of the edition 2015 case beside it: turning discovery off for a declared bin must not reach a package that keeps it on.
