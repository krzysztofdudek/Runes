---
id: rust-edition-2015-use-crate-root-item-bitflags-edge
language: rust
category: import
expectation: edge
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root defines); the bitflags crate documentation — macro bitflags! (it defines the struct it is given, whose flags are associated constants of that struct)"
---

## Rule

A `bitflags!` invocation at the top level of `src/lib.rs` defines the struct it is given as an item of the crate root, so in edition 2015 `use Flags;` binds `src/lib.rs` (node `src`). Its flags are associated constants of the struct, not items of the root, so `use READ;` binds nothing.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
#[macro_use]
extern crate bitflags;

bitflags! {
    #[derive(Default)]
    pub struct Flags: u32 {
        const READ = 1;
    }
}
```

```rust path=src/api/client.rs
use Flags;
use READ;
```

## Expect

- src/api/client.rs:1 -> node:src    # `bitflags!` defines the struct `Flags` at the top level of the crate root

## Why

The struct a `bitflags!` invocation defines is how many old crates name their flag sets; only the struct is an item of the root, while a flag lives inside it.
