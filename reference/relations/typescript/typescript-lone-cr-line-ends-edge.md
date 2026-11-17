---
id: typescript-lone-cr-line-ends-edge
language: typescript
category: trap
expectation: edge
cites: "ECMAScript 2025 §12.3 Line Terminators (CR is a line terminator; CR LF is one); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

A file whose lines end with a lone CR (old Mac line ends) has as many lines as an editor shows, and ECMAScript reads a lone CR as a line terminator. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```ts path=r/m/value.ts
export const v = 1;
```

```ts path=r/app/use.ts eol=cr
const a = 1;
const b = 2;
import { v } from '../m/value';
export const w = v + a + b;
```

## Expect

- r/app/use.ts:3 -> node:m      # the import on the third line, after two lines ended by a lone CR, reports line 3, never line 1

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1.
