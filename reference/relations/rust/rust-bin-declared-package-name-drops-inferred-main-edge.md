---
id: rust-bin-declared-package-name-drops-inferred-main-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `inferred_bins` (`src/main.rs` is inferred under the package's name) and `toml_targets_and_inferred` (an inferred target whose name a declared target has is not appended)"
---

## Rule

In an edition 2021 package named `app`, `[[bin]] name = "app" path = "cli/main.rs"` declares a bin of the package's own name. The inferred bin of `src/main.rs` carries that name too, so Cargo leaves it out: `src/main.rs` is no crate root, and `use self::tools::Helper;` in it reaches nothing. The declared file `cli/main.rs` is the root.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[[bin]]
name = "app"
path = "cli/main.rs"
```

```rust path=cli/main.rs
use self::parts::Part;
```

```rust path=cli/parts/mod.rs
pub struct Part;
```

```rust path=src/main.rs
use self::tools::Helper;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

## Expect

- cli/main.rs:1 -> node:parts          # the declared bin named app is rooted at its path; the inferred src/main.rs is dropped

## Why

`inferred_bins` names `src/main.rs` after the package, so a declared bin of that name with another path replaces it. Keeping `src/main.rs` a root gives a file Cargo does not build the edges of one that it does.
