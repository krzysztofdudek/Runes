---
id: csharp-comparison-pair-indexer-argument-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §6.2.5 (grammar ambiguities); §12.17 (declaration expressions are only `out` arguments and deconstruction targets)"
---

## Rule

The same misparse inside the brackets of an element access, `this[a < Low, c > High]`, is two comparisons and names no type.

## Files

```csharp path=src/app/Grid.cs
using Shop.Core;
class Grid {
  const int Low = 0;
  const int High = 9;
  bool this[bool x, bool y] => x && y;
  bool M(int a, int c) => this[a < Low, c > High];
}
```

```csharp path=src/core/Types.cs
namespace Shop.Core;
public class Low {}
```

## Expect

- silence      # `a < Low, c > High` are two comparisons, not a declaration of type `a<Low, c>`

## Why

An indexer argument list is parsed like a call's, so it carries the same misparse and needs the same guard.
