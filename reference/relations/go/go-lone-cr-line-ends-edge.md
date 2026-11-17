---
id: go-lone-cr-line-ends-edge
language: go
category: trap
expectation: edge
cites: "The Go Programming Language Specification, Source code representation and Semicolons (a carriage return is white space; explicit semicolons end the clauses); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

Go reads a lone CR as white space, so a file with old Mac line ends is valid Go when its semicolons are written, as here; an editor still shows it on as many lines as it has line ends. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```go path=m/go.mod
module example.com/m
```

```go path=m/billing/charge.go
package billing
func Charge() {}
```

```go path=m/app/main.go eol=cr
package main;

import pay "example.com/m/billing";

func main() { pay.Charge() }
```

## Expect

- m/app/main.go:3 -> node:billing      # the import on the third line as an editor shows it reports line 3, never line 1

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1. The Go compiler counts lines by LF alone; the line reported here is the editor's, where a person reads the message and writes a waiver.
