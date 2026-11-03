---
id: rust-target-paths-shared-dir-silence
language: rust
category: import
expectation: silence
cites: "The Cargo Book — Cargo Targets (each `[[test]]` target's `path` names its own crate root; target auto-discovery makes every `tests/*.rs` a test crate, from the 2018 edition on even when a target is declared); Rust Reference — Modules (a module belongs to the crate whose root declares it); Runes issue 173"
---

## Rule

Two `[[test]]` paths can share a directory: `suites/a.rs` and `suites/b.rs` root two test crates, and `suites/shared/mod.rs` belongs to whichever declares `mod shared;`, which a path-based reader cannot tell. In an edition 2018 package, as ripgrep is, a `[[test]]` path in `tests/` itself (ripgrep's `tests/tests.rs`) leaves test auto-discovery on, so `tests/common/mod.rs` stays a shared helper, as without it: other test crates in `tests/` may declare it too. So `crate::Env` in `suites/shared/mod.rs` and `crate::Dir` in `tests/common/mod.rs` bind no crate root, although `suites/a.rs` (node `suites`), `tests/tests.rs` (node `tests`) and the library `src/lib.rs` (node `src`) each declare such a name. The edition is written because it decides the helper: in an edition 2015 package the declared `[[test]]` turns test discovery off, `tests/tests.rs` is then the one test crate in `tests/`, and the helper binds it (`rust-edition-2015-declared-test-common-module-edge`); the two roots in `suites/` stay silent in either edition.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2018"

[[test]]
name = "integration"
path = "tests/tests.rs"

[[test]]
name = "a"
path = "suites/a.rs"

[[test]]
name = "b"
path = "suites/b.rs"
```

```rust path=src/lib.rs
pub struct Env;
pub struct Dir;
```

```rust path=suites/a.rs
pub struct Env;
```

```rust path=suites/b.rs
fn main() {}
```

```rust path=suites/shared/mod.rs
use crate::Env;
```

```rust path=tests/tests.rs
pub struct Dir;
```

```rust path=tests/common/mod.rs
use crate::Dir;
```

## Expect

- silence      # crate:: items from a module two test roots share, and from a shared helper under tests/ → no crate root to bind; never suites/a.rs (node:suites), tests/tests.rs (node:tests) or src/lib.rs (node:src)

## Why

Binding a module that several test crates may declare to one of their roots, or to the library, points `crate::` items at a crate the module may not belong to, a false edge.
