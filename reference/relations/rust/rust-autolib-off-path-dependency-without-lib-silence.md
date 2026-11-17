---
id: rust-autolib-off-path-dependency-without-lib-silence
language: rust
category: trap
expectation: silence
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `normalize_lib` and `is_normalized` (with `autolib = false` and no `[lib]` table a package has no library for a dependent to link)"
---

## Rule

The package `app` depends by path on `core-lib`, which writes `autolib = false` and has no `[lib]` table. `core-lib` has no library (it builds only its binary `src/main.rs`), so it gives `app` no crate called `core_lib`, and `src/lib.rs` of `core-lib` is not a library. The name `core_lib` is the registry crate `core-lib-api`, which `app` depends on under that name, so `use core_lib::util::Thing;` in `app` binds no file of the repository. The `mod util;` of `core-lib/src/lib.rs` declares nothing either, since no crate has that file for its root.

## Files

```toml path=app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
core-lib = { path = "../core-lib" }
core_lib = { package = "core-lib-api", version = "1" }
```

```toml path=core-lib/Cargo.toml
[package]
name = "core-lib"
edition = "2021"
autolib = false
```

```rust path=core-lib/src/lib.rs
pub struct Marker;
pub mod util;
```

```rust path=core-lib/src/util/mod.rs
pub struct Thing;
```

```rust path=core-lib/src/main.rs owner=corebin
fn main() {}
```

```rust path=app/src/main.rs
use core_lib::util::Thing;
fn main() {}
```

## Expect

- silence             # the dependency has no library, so its crate name resolves to nothing

## Why

A dependency's library tree is the one Cargo builds. With no library there is no tree, so resolving the dependency's name into `src/lib.rs` gives an edge into a file nobody links. `app` names a registry crate there because rustc refuses the path where nothing of that name is linked.
