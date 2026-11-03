---
id: rust-bin-declared-name-drops-inferred-bin-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs at tag 0.85.0, `toml_targets_and_inferred`: `seen_names` holds the name of every declared target, and an inferred target with one of those names is not appended to the targets, in every edition"
---

## Rule

In an edition 2021 package, `[[bin]] name = "cli" path = "tools/cli.rs"` declares a bin. The file `src/bin/cli.rs` would be inferred as a bin of the same name, so Cargo leaves it out: it is no crate root, and `use self::util::Thing;` in it reaches nothing. The declared file `tools/cli.rs` is the root: `use self::parts::Part;` in it reaches `tools/parts/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[[bin]]
name = "cli"
path = "tools/cli.rs"
```

```rust path=tools/cli.rs
use self::parts::Part;
```

```rust path=tools/parts/mod.rs
pub struct Part;
```

```rust path=src/bin/cli.rs
use self::util::Thing;
```

```rust path=src/bin/util/mod.rs
pub struct Thing;
```

## Expect

- tools/cli.rs:1 -> node:parts          # the declared path is the bin's root; src/bin/cli.rs shares its name and is dropped

## Why

Reading every file of `src/bin` as a root of its own gives the dropped file the edges of a crate root, here to the module `util` beside it, although Cargo builds no bin from it.
