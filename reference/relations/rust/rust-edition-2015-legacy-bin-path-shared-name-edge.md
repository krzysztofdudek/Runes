---
id: rust-edition-2015-legacy-bin-path-shared-name-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `target_path` (a `[[bin]]` with no `path` whose name matches two inferred targets takes `legacy_path` in edition 2015) and `legacy_bin_path` (`src/<name>.rs` when the package has no library, else `src/main.rs`, else `src/bin/main.rs`)"
---

## Rule

An edition 2015 package with no library declares `[[bin]] name = "cli"` with no `path`. Both `src/bin/cli.rs` and `src/bin/cli/main.rs` exist, so two inferred bins carry that name. Cargo cannot pick one of them and builds the bin from its legacy path, `src/cli.rs`. That file is the crate root, and `use self::tools::Helper;` in it reaches `src/tools/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[bin]]
name = "cli"
```

```rust path=src/cli.rs
use self::tools::Helper;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

```rust path=src/bin/cli.rs
fn main() {}
```

```rust path=src/bin/cli/main.rs
fn main() {}
```

## Expect

- src/cli.rs:1 -> node:tools          # two inferred bins named `cli`: the legacy path src/cli.rs is the root

## Why

`target_path` matches the name against the inferred targets and, on `(Some(p0), Some(p1))`, returns `legacy_path(target)` when `edition == Edition::Edition2015`, before it reports that Cargo "doesn't know which to use". Skipping the legacy path whenever one of the inferred files exists roots the bin at a file Cargo does not build and loses the edges of the one it does.
