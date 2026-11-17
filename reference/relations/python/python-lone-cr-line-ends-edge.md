---
id: python-lone-cr-line-ends-edge
language: python
category: trap
expectation: edge
cites: "Python Language Reference §2.1.2 Physical lines (a lone CR, CR LF or LF ends a physical line); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

Python ends a physical line with LF, CR LF or a lone CR, so a file with old Mac line ends has as many lines as an editor shows. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```python path=src/billing/charge.py
def charge():
    pass
```

```python path=src/app/main.py eol=cr
x = 1

import billing.charge
```

## Expect

- src/app/main.py:3 -> node:billing      # the import on the third line reports line 3, never line 1

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1.
