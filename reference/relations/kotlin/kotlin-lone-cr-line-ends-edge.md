---
id: kotlin-lone-cr-line-ends-edge
language: kotlin
category: trap
expectation: edge
cites: "Kotlin language specification, Syntax and grammar (NL: LF, or CR followed by an optional LF); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

Kotlin ends a line with a lone CR as well as with LF or CR LF, so a file with old Mac line ends has as many lines as an editor shows. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```kotlin path=src/audit/Audited.kt
package com.acme.audit
annotation class Audited
```

```kotlin path=src/c/Use.kt eol=cr
package com.acme.app

import com.acme.audit.Audited

@Audited
fun f() {}
```

## Expect

- src/c/Use.kt:3 -> node:audit      # the import on the third line reports line 3, never line 1
- src/c/Use.kt:5 -> node:audit      # the annotation on the fifth line reports line 5

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so every use was reported on line 1.
