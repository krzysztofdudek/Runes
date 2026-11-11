---
id: rust-edition-2015-bin-shared-module-crate-relative-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Use declarations (2015: relative to the crate root); Cargo targets.rs inferred_bins (src/bin/<name>.rs)"
---

## Rule

Edition 2015, auto-discovered bin `src/bin/tool.rs` declares `mod cli;` (src/bin/cli/mod.rs, node cli) and `mod run;`. In `src/bin/run/mod.rs`, `use cli::Args;` is relative to the bin's root, so it binds `src/bin/cli/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/bin/tool.rs owner=tool
mod cli;
mod run;
fn main() {}
```

```rust path=src/bin/cli/mod.rs
pub struct Args;
```

```rust path=src/bin/run/mod.rs
use cli::Args;
```

## Expect

- src/bin/run/mod.rs:1 -> node:cli
- src/bin/tool.rs:1 -> node:cli
- src/bin/tool.rs:2 -> node:run
