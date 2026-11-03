---
id: rust-edition-2015-legacy-lib-path-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `normalize_lib` (a `[lib]` with no `path` and no `src/lib.rs` is built from `src/<name>.rs` in edition 2015) and `legacy_bin_path` (`src/<name>.rs` only when the package has no library); src/cargo/util/toml/mod.rs at the same tag (`has_lib` is `normalized_toml.lib.is_some()`)"
---

## Rule

An edition 2015 package named `app` writes a `[lib]` table with no `path` and has no `src/lib.rs`, but has `src/app.rs`: Cargo builds the library from `src/app.rs`, so that file is the library's root and `use self::tools::Helper;` in it reaches `src/tools/mod.rs`. The package then has a library, so `[[bin]] name = "cli"`, found in neither `src/bin/cli.rs` nor `src/bin/cli/main.rs`, is built from `src/main.rs` and not from `src/cli.rs`: `use self::store::Db;` in `src/main.rs` reaches `src/store/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[lib]
doctest = false

[[bin]]
name = "cli"
```

```rust path=src/app.rs
use self::tools::Helper;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

```rust path=src/main.rs
use self::store::Db;
```

```rust path=src/store/mod.rs
pub struct Db;
```

```rust path=src/cli.rs
fn main() {}
```

## Expect

- src/app.rs:1 -> node:tools          # the 2015 library found only at src/<libname>.rs is its root
- src/main.rs:1 -> node:store         # with that library, the bin `cli` takes src/main.rs, not src/cli.rs

## Why

`normalize_lib` sets `lib.path` to `src/{name}.rs` when `edition == Edition::Edition2015 && package_root.join(&legacy_path).exists()`, and the caller passes `normalized_toml.lib.is_some()` to `normalize_bins` as `has_lib`, which `legacy_bin_path` reads in `if !has_lib { … src/{name}.rs … }`. Reading the library at `src/lib.rs` only, and the package as having none, misses the library's edges and roots the bin at a file Cargo does not build.
