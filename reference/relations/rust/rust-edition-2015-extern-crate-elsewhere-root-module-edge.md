---
id: rust-edition-2015-extern-crate-elsewhere-root-module-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Preludes, Extern prelude (in the 2015 edition, crates in the extern prelude cannot be referenced via use declarations); Extern crate declarations (the declaration binds its name in the module or block that writes it)"
---

## Rule

Edition 2015. The package has a path dependency `util` and its crate root declares a module of its own, `mod util;`. Three `extern crate` declarations name the dependency, and none of them binds the name `util` in the crate root: the root's own binds it as `u`, the one in `src/tools/mod.rs` binds `other` in that module, and the one in `src/jobs/mod.rs` stands in a function body. Each declaration binds the dependency `util/src/lib.rs` (node `depsrc`) on its own line. Every `use util::slug;` is relative to the crate root, where `util` is the module, and binds `src/util/mod.rs` (node `localutil`).

## Files

```toml path=Cargo.toml
[package]
name = "app"

[dependencies]
util = { path = "util" }
```

```toml path=util/Cargo.toml
[package]
name = "util"
```

```rust path=util/src/lib.rs owner=depsrc
pub fn slug() {}
```

```rust path=src/lib.rs owner=root
extern crate util as u;
mod util;
```

```rust path=src/util/mod.rs owner=localutil
pub fn slug() {}
```

```rust path=src/api/mod.rs
use util::slug;
```

```rust path=src/tools/mod.rs
extern crate util as other;
use util::slug;
```

```rust path=src/jobs/mod.rs
fn run() {
    extern crate util;
}
use util::slug;
```

## Expect

- src/lib.rs:1 -> node:depsrc           # the declaration names the crate util
- src/lib.rs:2 -> node:localutil
- src/api/mod.rs:1 -> node:localutil    # the root binds the crate as `u`; `util` is its module
- src/tools/mod.rs:1 -> node:depsrc
- src/tools/mod.rs:2 -> node:localutil  # `other` is bound here, and a `use` starts at the crate root anyway
- src/jobs/mod.rs:2 -> node:depsrc
- src/jobs/mod.rs:4 -> node:localutil   # a declaration in a function body binds nothing outside it

## Why

An `extern crate` that names a crate somewhere in a file says nothing about what a `use` path in that file starts with. Only the name the crate root binds decides.
