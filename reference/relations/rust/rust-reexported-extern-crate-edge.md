---
id: rust-reexported-extern-crate-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference — Extern crate declarations (`extern crate name as alias;` binds the alias in the module's type namespace; `pub` re-exports it); The Cargo Book — path dependencies"
---

## Rule

A facade crate can expose other crates as its own modules with `pub extern crate inner as name;`: ripgrep's `grep` crate does this for `printer`, `matcher`, `searcher` and the rest, and the `rg` binary imports `grep::printer::Standard`. The name `printer` is an item of `grep`'s crate root, bound there by the extern crate declaration, so the path binds `grep`'s crate root file `crates/grep/src/lib.rs` (node `src`), exactly as a `pub use` in that file would; the dependency is on `grep`, the crate the importing package names in its manifest. `crates/app/Cargo.toml` depends on `grep`; `use grep::printer::Standard;` and `use grep::matcher::Matcher;` (its declaration under a `#[macro_use]` attribute) bind `crates/grep/src/lib.rs`. `grep::searcher::Searcher` names nothing the root file declares and stays silent; rustc refuses that path, so it stands in `crates/app/src/cmd/search.rs`, a file no `mod` declares, which the crate does not compile.

## Files

```toml path=Cargo.toml
[workspace]
members = ["crates/*"]
```

```toml path=crates/grep/Cargo.toml
[package]
name = "grep"

[dependencies]
grep-printer = { path = "../printer" }
grep-matcher = { path = "../matcher" }
```

```toml path=crates/printer/Cargo.toml
[package]
name = "grep-printer"
```

```toml path=crates/matcher/Cargo.toml
[package]
name = "grep-matcher"
```

```toml path=crates/app/Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
grep = { path = "../grep" }
```

```rust path=crates/grep/src/lib.rs
pub extern crate grep_printer as printer;
#[macro_use]
pub extern crate grep_matcher as matcher;
```

```rust path=crates/printer/src/lib.rs
pub struct Standard;
```

```rust path=crates/matcher/src/lib.rs
pub trait Matcher {}
```

```rust path=crates/app/src/cmd/run.rs
use grep::printer::Standard;
use grep::matcher::Matcher;
```

```rust path=crates/app/src/cmd/search.rs
use grep::searcher::Searcher;
```

```rust path=crates/app/src/cmd/mod.rs
pub mod run;
```

```rust path=crates/app/src/lib.rs
pub mod cmd;
```

## Expect

- crates/app/src/cmd/run.rs:1 -> node:src     # grep::printer → `pub extern crate grep_printer as printer;` in crates/grep/src/lib.rs
- crates/app/src/cmd/run.rs:2 -> node:src     # grep::matcher → `pub extern crate grep_matcher as matcher;` in crates/grep/src/lib.rs
- crates/app/src/lib.rs:1 -> node:cmd      # the module declaration of the completed crate

## Why

A crate-root lookup that only counts items and `use` declarations misses names bound by `extern crate`, so every import through a facade crate that re-exports its parts this way is silently dropped, and the binary's dependency on the facade crate passes the check undeclared.
