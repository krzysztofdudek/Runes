---
id: rust-unresolved-outside-or-unfollowed-silence
language: rust
category: trap
expectation: silence
cites: "The Rust Reference, Paths (`crate::`, the extern prelude: `std`, `core` and the dependencies)"
---

## Rule

A path that starts at a crate the repository does not hold (`std`, `core`, a registry dependency) leaves the repository: absent, `outside`. A `crate::` path whose module is no file, here one a macro writes, points into the crate and binds nothing: absent, `unfollowed`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
version = "0.1.0"
edition = "2021"
```

```rust path=src/main.rs
use std::fmt::Display;
use core::mem;
use crate::made::Thing;

macro_rules! make {
    () => {
        pub mod made {
            pub struct Thing;
        }
    };
}
make!();

fn show(_: &dyn Display) {}

fn main() {
    let _ = mem::size_of::<Thing>();
    show(&1);
}
```

## Expect

- silence      # nothing binds another file
- src/main.rs:1 answers absent outside
- src/main.rs:2 answers absent outside
- src/main.rs:3 answers absent unfollowed

## Why

The readers do not expand macros, so `crate::made` is a module of the crate they could not follow, not a crate from elsewhere.
