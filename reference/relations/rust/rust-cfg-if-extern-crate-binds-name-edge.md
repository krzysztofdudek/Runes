---
id: rust-cfg-if-extern-crate-binds-name-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Extern crate declarations (the declaration binds its name in the module that writes it; in the crate root it adds the name to the extern prelude); cfg-if (each branch expands to the items it holds, under the branch's cfg)"
---

## Rule

An `extern crate` written in a branch of `cfg_if!` among a module's items is an item of that module on the targets where the branch holds, so it binds its name as one written outside the macro does. In the crate root `src/lib.rs`, `extern crate util as u;` in both branches puts `u` in the extern prelude of every module, so `use u::Marker;` in `src/net.rs` names the crate `util` (node `util`). In `src/net.rs`, `extern crate util as v;` in a branch binds `v` in that module, so `use v::Marker;` there names it too. Each declaration names the crate as well. The crate defines its own `cfg_if!`, which expands as the published `cfg-if` does for these branches.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
util = { path = "util" }
```

```toml path=util/Cargo.toml
[package]
name = "util"
edition = "2021"
```

```rust path=util/src/lib.rs owner=util
pub struct Marker;
```

```rust path=src/lib.rs owner=app
macro_rules! cfg_if {
    (if #[cfg($m:meta)] { $($a:item)* } else { $($b:item)* }) => {
        $(#[cfg($m)] $a)*
        $(#[cfg(not($m))] $b)*
    };
}
cfg_if! {
    if #[cfg(unix)] {
        extern crate util as u;
    } else {
        extern crate util as u;
    }
}
pub mod net;
```

```rust path=src/net.rs owner=net
use u::Marker;
cfg_if! {
    if #[cfg(feature = "never")] {
        extern crate util as v;
    } else {
        extern crate util as v;
    }
}
use v::Marker as Other;
pub fn mark() -> (Marker, Other) {
    (Marker, Other)
}
```

## Expect

- src/lib.rs:9 -> node:util    # `extern crate util as u;`
- src/lib.rs:11 -> node:util
- src/lib.rs:14 -> node:net
- src/net.rs:1 -> node:util    # `u` from the root's extern prelude
- src/net.rs:4 -> node:util    # `extern crate util as v;`
- src/net.rs:6 -> node:util
- src/net.rs:9 -> node:util    # `v` bound in this module

## Why

The body of a macro is tokens to the grammar, so a reader of the parse tree alone sees no `extern crate` there and loses every edge through the name it binds.
