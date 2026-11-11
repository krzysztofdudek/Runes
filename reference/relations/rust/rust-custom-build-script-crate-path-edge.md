---
id: rust-custom-build-script-crate-path-edge
language: rust
category: import
expectation: edge
cites: "Cargo targets.rs normalize_build; Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`build = "tools/build.rs"`: `crate::util::Gen` in the build script names the build script crate's own module `tools/util.rs` (same owner, no cross edge), never the library's `src/util/mod.rs` (node util). The only edge is the library's own `mod util;`.

## Files

```toml path=Cargo.toml
[package]
name = "kit"
edition = "2021"
build = "tools/build.rs"
```

```rust path=src/lib.rs
mod util;
```

```rust path=src/util/mod.rs
pub struct Gen;
```

```rust path=tools/build.rs
mod util;
use crate::util::Gen;
fn main() {}
```

```rust path=tools/util.rs
pub struct Gen;
```

## Expect

- src/lib.rs:1 -> node:util    # the library's `mod util;`; there is no edge from tools/build.rs:2, whose `crate::util` is tools/util.rs
