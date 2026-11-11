---
id: rust-crate-root-globs-under-opposite-cfgs-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Use declarations (a glob import brings in every public name of the module); Rust Reference, Conditional compilation (an item under a false cfg is removed)"
---

## Rule

The crate root of `kit` re-exports `Order` through one of two globs: `pub use unix::*;` under `#[cfg(unix)]` and `pub use windows::*;` under `#[cfg(windows)]`, each module defining its own `Order`. On any one target at most one of the globs is there, so the name is not ambiguous, and `use kit::Order;` in `app`, like `use crate::Order;` in `kit/src/user.rs`, binds the root `kit/src/lib.rs` (node `kit`). Two globs that nothing can switch off and that both bring a name in still give no edge.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { path = "kit" }
```

```toml path=kit/Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=kit/src/lib.rs owner=kit
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;
#[cfg(unix)]
pub use unix::*;
#[cfg(windows)]
pub use windows::*;
mod user;
```

```rust path=kit/src/unix.rs owner=unix
pub struct Order;
```

```rust path=kit/src/windows.rs owner=win
pub struct Order;
```

```rust path=kit/src/user.rs owner=user
use crate::Order;
pub fn take(_o: Order) {}
```

```rust path=src/lib.rs owner=app
use kit::Order;
pub fn place() -> Order {
    Order
}
```

## Expect

- kit/src/lib.rs:2 -> node:unix
- kit/src/lib.rs:4 -> node:win
- kit/src/lib.rs:6 -> node:unix
- kit/src/lib.rs:8 -> node:win
- kit/src/lib.rs:9 -> node:user
- kit/src/user.rs:1 -> node:kit   # `crate::Order`, an item a glob of the root brings in
- src/lib.rs:1 -> node:kit        # `kit::Order`, the same item

## Why

Counting a glob that a `cfg` may remove as one that is always there makes a platform split look like an ambiguous name, and the edge through the root, which may be the only one between the two crates, is lost.
