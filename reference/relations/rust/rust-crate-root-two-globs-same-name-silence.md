---
id: rust-crate-root-two-globs-same-name-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Use declarations, Glob imports (a name two globs both bring in is ambiguous where it is used; rustc reports E0659)"
---

## Rule

The crate root of the path dependency `kit` writes `pub use types::*;` and `pub use models::*;`, and both modules define `Order`. Rust refuses `use kit::Order;` as ambiguous, so the path gives no edge.

## Files

```toml path=app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
kit = { path = "../kit" }
```

```toml path=kit/Cargo.toml
[package]
name = "kit"
edition = "2021"
```

```rust path=kit/src/lib.rs owner=kit
mod types;
mod models;
pub use types::*;
pub use models::*;
```

```rust path=kit/src/types/mod.rs owner=kit
pub struct Order;
```

```rust path=kit/src/models/mod.rs owner=kit
pub struct Order;
```

```rust path=app/src/lib.rs owner=root
use kit::Order;
```

## Expect

- silence      # two globs of the root both bring `Order` in
