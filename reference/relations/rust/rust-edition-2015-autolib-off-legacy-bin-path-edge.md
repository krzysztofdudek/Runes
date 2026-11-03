---
id: rust-edition-2015-autolib-off-legacy-bin-path-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/mod.rs at tag 0.85.0 (`normalize_bins` is given `has_lib` as `normalized_toml.lib.is_some()`) and src/cargo/util/toml/targets.rs, `normalize_lib` and `legacy_bin_path` (the bin is built from `src/<name>.rs` when the package has no library)"
---

## Rule

An edition 2015 package writes `autolib = false`, has no `[lib]` table, and still has a file `src/lib.rs`. Cargo has no library, so a `[[bin]] name = "cli"` with no `path` that is found nowhere in `src/bin` is built from `src/cli.rs`: that file is a crate root, and `use self::tools::Helper;` in it reaches `src/tools/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
autolib = false

[[bin]]
name = "cli"
```

```rust path=src/lib.rs
pub mod other;
```

```rust path=src/other.rs
pub struct Thing;
```

```rust path=src/cli.rs
use self::tools::Helper;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

## Expect

- src/cli.rs:1 -> node:tools          # no library (autolib = false): the legacy bin path src/<name>.rs applies

## Why

`legacy_bin_path` tries `src/<name>.rs` only `if !has_lib`, and `has_lib` is whether the library target exists, which `autolib = false` without a `[lib]` table denies even though `src/lib.rs` is on disk. Taking the file's existence for a library skips the legacy path and loses the edges of the bin that Cargo does build.
