---
id: rust-autolib-off-own-crate-name-from-bin-silence
language: rust
category: trap
expectation: silence
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `normalize_lib` and `is_normalized` (with `autolib = false` and no `[lib]` table the package has no library, so its crate name addresses nothing)"
---

## Rule

An edition 2021 package named `app` writes `autolib = false` and has no `[lib]` table. Cargo infers no library, so the package's own name addresses no crate and `src/lib.rs` is not built as one. The manifest depends on the registry crate `app-api` under the name `app`, so `use app::util::Thing;` in the bin names that crate: it binds no file of the package, whatever stands at `src/lib.rs` and `src/util/mod.rs`. The `mod util;` of `src/lib.rs` declares nothing either, since no crate has that file for its root.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
autolib = false

[dependencies]
app = { package = "app-api", version = "1" }
```

```rust path=src/lib.rs
pub struct Marker;
pub mod util;
```

```rust path=src/util/mod.rs
pub struct Thing;
```

```rust path=src/main.rs
use app::util::Thing;
fn main() {}
```

## Expect

- silence             # the package has no library, so its own crate name resolves to nothing

## Why

The package's crate name addresses its library from any target only when it has one. Resolving `app::…` into `src/lib.rs` whatever `autolib` says gives the bin an edge into a file Cargo does not build as a library. The bin's path names a registry crate because rustc refuses it where nothing of that name is linked.
