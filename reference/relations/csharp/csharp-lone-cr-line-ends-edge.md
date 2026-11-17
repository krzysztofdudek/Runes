---
id: csharp-lone-cr-line-ends-edge
language: csharp
category: trap
expectation: edge
cites: "C# language specification §6.3.2 Line terminators (carriage return, line feed, carriage return followed by line feed, and others); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

C# ends a line with a lone CR as well as with LF or CR LF, so a file with old Mac line ends has as many lines as an editor shows. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```csharp path=src/c/Use.cs eol=cr
using N;

class C : Type { }
```

```csharp path=src/n/Type.cs
namespace N;
public class Type {}
```

## Expect

- src/c/Use.cs:3 -> node:n      # the base type on the third line reports line 3, never line 1

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1.
