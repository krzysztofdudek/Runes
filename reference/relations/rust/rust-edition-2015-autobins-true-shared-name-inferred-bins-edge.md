---
id: rust-edition-2015-autobins-true-shared-name-inferred-bins-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `toml_targets_and_inferred` (an inferred target whose name is in `seen_names`, the names of the declared targets, is left out of `rem_targets`) and `target_path` / `legacy_bin_path` (a `[[bin]]` with no `path` whose name matches two inferred targets takes the legacy path in edition 2015)"
---

## Rule

An edition 2015 package with no library writes `autobins = true` and declares `[[bin]] name = "cli"` with no `path`. Both `src/bin/cli.rs` and `src/bin/cli/main.rs` exist, so two inferred bins carry the declared name. Cargo drops both of them (`seen_names`) and builds the bin from its legacy path, `src/cli.rs`, alone. So `src/cli.rs` is a crate root, and `use self::tools::Helper;` in it reaches `src/tools/mod.rs`, while the two inferred files are no roots: `self::` in them reaches nothing beside them.

## Files

```toml path=Cargo.toml
[package]
name = "app"
autobins = true

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
use self::util::Thing;
```

```rust path=src/bin/util/mod.rs
pub struct Thing;
```

```rust path=src/bin/cli/main.rs
use self::inner::Item;
```

```rust path=src/bin/cli/inner.rs
pub struct Item;
```

## Expect

- src/cli.rs:1 -> node:tools          # the legacy path is the bin's root; the two inferred files named cli are dropped

## Why

`toml_targets_and_inferred` removes every inferred target whose name a declared target has before it appends the rest (`autobins = true`), and `target_path` then cannot pick one of the two files and falls to `legacy_bin_path`. Rooting the inferred files all the same gives edges from files Cargo never builds as a bin.
