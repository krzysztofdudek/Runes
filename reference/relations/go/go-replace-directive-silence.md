---
id: go-replace-directive-silence
language: go
category: import
expectation: silence
cites: "go.dev/ref/mod — replace directive (redirects a module path to a local path; applies only in the main module); research F4"
---

## Rule

A main-module `replace example.com/other => ./vendored/other` names a local directory as the root of the replacement module, and the go toolchain requires that directory to hold a `go.mod`. Here `vendored/other/` holds none, so the toolchain refuses the build and loads nothing from it. The resolver takes a directory replacement only when the directory's `go.mod` declares the replaced module (go-replace-sibling-module-edge), so this one is not taken: `example.com/other` is not under the module `example.com/m`, and the import gives no edge. It never binds a directory the toolchain would not load.

## Files

```go path=m/go.mod
module example.com/m

replace example.com/other => ./vendored/other
```

```go path=m/vendored/other/pkg.go
package other
func Helper() {}
```

```go path=m/app/main.go
package main
import "example.com/other"
func main() { other.Helper() }
```

## Expect

- silence      # `example.com/other` is not under module `example.com/m`, and the replacement directory holds no go.mod → no edge

## Why

A guessed redirect would bind files the build never loads; a replacement is taken only where it is a module of the repository.
