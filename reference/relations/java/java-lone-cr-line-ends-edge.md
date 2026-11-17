---
id: java-lone-cr-line-ends-edge
language: java
category: trap
expectation: edge
cites: "JLS 21 §3.4 Line Terminators (CR, LF, or CR LF); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

Java ends a line with a lone CR as well as with LF or CR LF, so a file with old Mac line ends has as many lines as an editor shows. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```java path=src/main/java/com/acme/payments/PaymentService.java
package com.acme.payments;
public class PaymentService {}
```

```java path=src/main/java/com/app/Use.java eol=cr
package com.app;

import com.acme.payments.PaymentService;

class C {}
```

## Expect

- src/main/java/com/app/Use.java:3 -> node:payments      # the import on the third line reports line 3, never line 1

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1.
