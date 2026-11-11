---
id: rust-autolib-off-own-crate-name-from-bin-silence
language: rust
category: trap
expectation: silence
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `normalize_lib` and `is_normalized` (with `autolib = false` and no `[lib]` table the package has no library, so its crate name addresses nothing)"
---

## Rule

An edition 2021 package named `app` writes `autolib = false` and has no `[lib]` table. Cargo infers no library, so no crate is called `app` and `src/lib.rs` is not built as one. `use app::util::Thing;` in the bin reaches nothing: it binds no file of the package, whatever stands at `src/lib.rs` and `src/util/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
autolib = false
```

```rust path=src/lib.rs
pub struct Marker;
```

```rust path=src/util/mod.rs
pub struct Thing;
```

```rust path=src/main.rs
use app::util::Thing;
```

## Expect

- silence             # the package has no library, so its own crate name resolves to nothing

## Why

The package's crate name addresses its library from any target only when it has one. Resolving `app::…` into `src/lib.rs` whatever `autolib` says gives the bin an edge into a file Cargo does not build as a library.
