---
id: rust-autolib-off-lib-file-module-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `normalize_lib` and `is_normalized` (with `autolib = false` and no `[lib]` table the package has no library: `inferred_lib` is not consulted)"
---

## Rule

An edition 2021 package writes `autolib = false` and has no `[lib]` table. Cargo infers no library, so `src/lib.rs` is not a crate root: `use self::tools::Helper;` in it reaches nothing. `src/main.rs` is still the root of the package's bin, and `use self::util::Thing;` in it reaches `src/util/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
autolib = false
```

```rust path=src/lib.rs
use self::tools::Helper;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

```rust path=src/main.rs
use self::util::Thing;
```

```rust path=src/util/mod.rs
pub struct Thing;
```

## Expect

- src/main.rs:1 -> node:util          # the inferred bin is untouched; src/lib.rs is no library root

## Why

`normalize_lib` returns early when `autolib` is `Some(false)` and no `[lib]` is written: the library is `None`. Reading `src/lib.rs` as a root whatever `autolib` says gives a stray file the edges of a library Cargo does not build.
