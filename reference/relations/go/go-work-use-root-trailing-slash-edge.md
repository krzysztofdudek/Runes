---
id: go-work-use-root-trailing-slash-edge
language: go
category: import
expectation: edge
cites: "go.dev/ref/mod — go.work `use` directive: each argument is a directory relative to the go.work file, so `./` and `.` name the same module directory"
---

## Rule

A `go.work` at the repository root that writes the root module as `use ./`, with a trailing slash, names the same directory as `use .`. A member nested below the root that imports a package of the root module reaches it in that one directory, which its ancestor `go.mod` names too, so the import resolves as with `use .`.

## Files

```go path=go.work
go 1.22

use (
  ./
  ./tools
)
```

```go path=go.mod
module example.com/root
```

```go path=lib/lib.go
package lib

func Use() {}
```

```go path=tools/go.mod
module example.com/tools
```

```go path=tools/gen/gen.go
package gen

import "example.com/root/lib"

func Run() { lib.Use() }
```

## Expect

- tools/gen/gen.go:3 -> node:lib      # ./ is the root module's directory, the one the ancestor go.mod gives
- tools/gen/gen.go:3 answers resolved lib/lib.go

## Why

Reading `./` and the root as two places makes one module path claimed by two directories, so the import was answered unfollowed with no edge, though the workspace wires exactly one module there.
