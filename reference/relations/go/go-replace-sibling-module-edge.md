---
id: go-replace-sibling-module-edge
language: go
category: import
expectation: edge
cites: "go.dev/ref/mod — replace directive: a right side that begins with ./ or ../ is the local root directory of the replacement module, which must contain a go.mod; replace applies in the main module's go.mod"
---

## Rule

A repository with several Go modules and no `go.work` wires them with `replace`: `ui/go.mod` writes `replace example.com/data => ../data`, and `data/go.mod` declares `module example.com/data`. Building `ui`, the toolchain loads `example.com/data` and its packages from `data/`, so an import of them in `ui` binds the files there. The resolver reads the `replace` directives of the importing file's own `go.mod` and takes a replacement only when its right side is a relative directory inside the repository whose `go.mod` declares the replaced module. A replacement by another module version, or by a directory outside the repository, stays outside.

## Files

```go path=ui/go.mod
module example.com/ui

go 1.22

require (
	example.com/data v0.0.0
	example.com/far v0.0.0
	example.com/fork v1.0.0
)

replace example.com/data => ../data

replace (
	example.com/far => ../../far
	example.com/fork v1.0.0 => example.com/fork2 v1.1.0
)
```

```go path=data/go.mod
module example.com/data

go 1.22
```

```go path=data/d.go
package data

func Load() {}
```

```go path=data/store/store.go
package store

func Open() {}
```

```go path=ui/app/main.go
package main

import (
	"example.com/data"
	"example.com/data/store"
	"example.com/far"
	"example.com/fork"
)

func main() { data.Load(); store.Open(); far.X(); fork.Y() }
```

## Expect

- ui/app/main.go:4 -> node:data      # the replace names data/, whose go.mod declares example.com/data
- ui/app/main.go:5 -> node:store
- ui/app/main.go:4 answers resolved data/d.go
- ui/app/main.go:5 answers resolved data/store/store.go
- ui/app/main.go:6 answers absent outside      # replaced by a directory above the repository
- ui/app/main.go:7 answers absent outside      # replaced by another module version

## Why

Without the `replace` directives the import of a sibling module was answered outside, as if the module were downloaded, so a repository wired by `replace` and no `go.work` had none of the imports between its modules checked.
