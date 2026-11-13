---
id: go-unresolved-outside-or-unfollowed-silence
language: go
category: trap
expectation: silence
cites: "Go Modules Reference (a package belongs to the module whose path prefixes its import path)"
---

## Rule

An import path no module of the repository holds (the standard library, a module from elsewhere) leaves the repository: absent, `outside`. An import path under the repository's own `go.mod` module whose package is not there points into the repository and binds nothing: absent, `unfollowed`.

## Files

```go path=go.mod
module example.com/m
```

```go path=domain/order.go
package domain

import (
	"fmt"
	"github.com/google/uuid"
	"example.com/m/generated"
)

var _ = fmt.Sprint
var _ = uuid.New
var _ = generated.X
```

## Expect

- silence      # no import binds a file of the repository
- domain/order.go:4 answers absent outside
- domain/order.go:5 answers absent outside
- domain/order.go:6 answers absent unfollowed

## Why

`example.com/m/generated` is the module's own package, written by a generator and not committed; a consumer must not count it with `fmt`.
