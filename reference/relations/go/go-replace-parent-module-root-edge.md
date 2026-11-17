---
id: go-replace-parent-module-root-edge
language: go
category: import
expectation: edge
cites: "go.dev/ref/mod — replace directive with a local directory; golang.org/x/tools, whose gopls/go.mod writes `replace golang.org/x/tools => ../`"
---

## Rule

A module nested in the repository often replaces the module at the repository root with the root itself, written `../` from one level down or `../../` from two. That is the module the nested module's ancestor `go.mod` already names, in the same directory, so an import of the root module's packages resolves into them as it does without the `replace`.

## Files

```go path=go.mod
module golang.org/x/tools
```

```go path=go/packages/packages.go
package packages

func Load() {}
```

```go path=gopls/go.mod
module golang.org/x/tools/gopls

require golang.org/x/tools v0.30.0

replace golang.org/x/tools => ../
```

```go path=gopls/main.go
package main

import "golang.org/x/tools/go/packages"

func main() { packages.Load() }
```

```go path=internal/tool/go.mod
module golang.org/x/tools/internal/tool

require golang.org/x/tools v0.30.0

replace golang.org/x/tools => ../../
```

```go path=internal/tool/run.go
package tool

import "golang.org/x/tools/go/packages"

func Run() { packages.Load() }
```

## Expect

- gopls/main.go:3 -> node:packages      # the replace names the root module the ancestor go.mod already gives
- internal/tool/run.go:3 -> node:packages
- gopls/main.go:3 answers resolved go/packages/packages.go
- internal/tool/run.go:3 answers resolved go/packages/packages.go

## Why

The replacement directory and the ancestor module are the same module in the same place; reading them as two places would make the import contradictory and drop an edge the repository has.
