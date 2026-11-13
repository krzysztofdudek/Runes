---
id: go-package-split-owners-candidates-silence
language: go
category: trap
expectation: silence
cites: "Go spec, Import declarations (an import names a package, the files of one directory); distinct-owner rule of the package import"
---

## Rule

An import of a package of the module whose files belong to two owners binds neither owner: the package has no single owner. The answer is ambiguous and names the package's files, sorted, as Java and Kotlin answer an import of a package split the same way.

## Files

```go path=go.mod
module example.com/m
```

```go path=service/a.go owner=app
package service

func A() {}
```

```go path=service/b_gen.go owner=gen
package service

func B() {}
```

```go path=domain/order.go
package domain

import "example.com/m/service"

var _ = service.A
```

## Expect

- silence      # service/ is split between the owners app and gen
- domain/order.go:3 answers ambiguous service/a.go, service/b_gen.go

## Why

The answer was absent, the same as for a package outside the module, so a consumer could not tell a split package from one it does not need to follow.
