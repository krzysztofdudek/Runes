---
id: cpp-lone-cr-line-ends-edge
language: cpp
category: trap
expectation: edge
cites: "ISO C++ [lex.phases] (physical source lines map to lines in an implementation-defined manner); GCC C preprocessor manual, Initial processing (LF, CR LF and CR all end a line); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

GCC ends a line at a lone CR, as it does at LF and CR LF, so a file with old Mac line ends has as many lines as an editor shows, and each directive stands on its own line. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```cpp path=app/detail/helper.hpp
#pragma once
struct Helper {};
```

```cpp path=app/main.cpp eol=cr
int x;

#include "detail/helper.hpp"
int main() { Helper h; return 0; }
```

## Expect

- app/main.cpp:3 -> node:detail      # the include on the third line reports line 3, never line 1

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1.
