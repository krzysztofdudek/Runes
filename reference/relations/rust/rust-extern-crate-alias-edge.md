---
id: rust-extern-crate-alias-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Extern crate declarations (`extern crate name as alias;`); The Cargo Book — path dependencies"
---

## Rule

`extern crate core_lib as cl;` links the in-repo path dependency `core_lib` and binds it under the local alias `cl`. The declaration itself names the crate, so it binds the crate's root file `crates/core-lib/src/lib.rs` (node `src`) on its own line. The package gives no edition, so it is edition 2015, where a `use` path is relative to the crate root: `use cl::Engine;` in the module `cmd::run` names the `cl` of the crate root, the registry crate `cl` that the root links with `extern crate cl;`, never the alias of the module itself, so it stays silent. The dependency is carried by the declaration line. `extern crate std as s;` names an external crate and stays silent too.

## Files

```toml path=Cargo.toml
[workspace]
members = ["crates/*"]
```

```toml path=crates/core-lib/Cargo.toml
[package]
name = "core-lib"
```

```toml path=crates/server/Cargo.toml
[package]
name = "server"

[dependencies]
core-lib = { path = "../core-lib" }
cl = "1"
```

```rust path=crates/core-lib/src/lib.rs
pub struct Engine;
```

```rust path=crates/server/src/cmd/run.rs
extern crate core_lib as cl;
use cl::Engine;
extern crate std as s;
```

```rust path=crates/server/src/cmd/mod.rs
pub mod run;
```

```rust path=crates/server/src/lib.rs
pub mod cmd;
extern crate cl;
```

## Expect

- crates/server/src/cmd/run.rs:1 -> node:src      # extern crate core_lib → the path dependency's crate root file
- crates/server/src/lib.rs:1 -> node:cmd      # the module declaration of the completed crate

## Why

The extern-crate declaration is the one place the real crate name appears, so it carries the edge. An alias bound in a module that is not the crate root is a name of that module alone, and an edition 2015 `use` path does not start there.
