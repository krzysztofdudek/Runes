---
id: rust-bin-shared-module-plain-and-cfg-bins-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs infer_subdirectory (a src/bin/<dir>/ is a target only with a main.rs); Rust Reference, Conditional compilation (an item under a false cfg is removed); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/bin/common/` has no `main.rs`, so it is a module of the binaries that declare it. `src/bin/app.rs` declares `mod common;` plainly, so it compiles the module in every configuration; `src/bin/tool.rs` declares it only under `#[cfg(feature = "x")]`, so it compiles it in some configuration at most. The module's crate is `app` first, as a module `src/lib.rs` declares plainly and `src/main.rs` only under a `cfg` is the library's first: `crate::Opts` in `src/bin/common/x.rs` binds `src/bin/app.rs`, which brings `Opts` in at its top level.

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"

[features]
x = []
```

```rust path=src/bin/app.rs
mod common;
pub use common::Opts;
fn main() {}
```

```rust path=src/bin/tool.rs
#[cfg(feature = "x")]
mod common;
#[cfg(feature = "x")]
pub use common::Opts;
fn main() {}
```

```rust path=src/bin/common/mod.rs
pub mod x;
pub struct Opts;
```

```rust path=src/bin/common/x.rs
use crate::Opts;
```

## Expect

- src/bin/app.rs:1 -> node:common   # `mod common;`
- src/bin/app.rs:2 -> node:common   # `pub use common::Opts;`
- src/bin/tool.rs:2 -> node:common
- src/bin/tool.rs:4 -> node:common
- src/bin/common/x.rs:1 -> node:bin   # `crate::Opts`, an item `src/bin/app.rs` brings in

## Why

A binary that declares the module under a `cfg` may not compile it at all. Counting it as a second root that certainly compiles the module leaves the module with no crate, and the edge to the one binary that always compiles it is lost.
