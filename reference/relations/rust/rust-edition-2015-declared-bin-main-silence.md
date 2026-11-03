---
id: rust-edition-2015-declared-bin-main-silence
language: rust
category: trap
expectation: silence
cites: "The Cargo Book — Cargo Targets, Target auto-discovery: \"For packages with the 2015 edition, the default for auto-discovery is `false` if at least one target is manually defined in `Cargo.toml`. Beginning with the 2018 edition, the default is always `true`.\""
---

## Rule

A package that gives no `edition` is edition 2015. When it declares a `[[bin]]` and writes no `autobins`, Cargo builds only the declared bin; `src/main.rs`, which no `[[bin]]` names, is not discovered, so it is no crate root and belongs to no crate. `use self::tools::Helper;` in it binds nothing.

## Files

```toml path=Cargo.toml
[package]
name = "app"

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

- silence      # edition 2015 with a declared [[bin]] turns bin auto-discovery off: src/main.rs is no crate root, so `self::tools` is not src/tools/mod.rs

## Why

Reading `src/main.rs` as a crate root whenever `autobins` is unset gives edges to the modules beside a file that Cargo does not compile as a binary, the kind of false edge that can close a cycle.
