---
id: csharp-comparison-pair-argument-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §6.2.5 (grammar ambiguities — `F(G < A, B > (7))`); §12.17 (declaration expressions are only `out` arguments and deconstruction targets)"
---

## Rule

The parser reads two comparisons in one argument list, `Within(i < Order, j > Max)`, as a declaration expression of a generic type `i<Order, j>` named `Max`. In C# a declaration expression is only an `out` argument or an element of a deconstruction target, so a plain argument never declares a variable and names no type here. Neither `i`, `Order` nor `j` is a type reference, even when another node declares a type `Order` under an imported namespace.

## Files

```csharp path=src/app/Range.cs
using Shop.Core;
namespace Shop.App;
class Range {
  int Order => 1;
  const int Max = 3;
  static bool Within(bool a, bool b) => a && b;
  bool M(int i, int j) => Within(i < Order, j > Max);
}
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order {}
```

## Expect

- silence      # `i < Order, j > Max` are two comparisons, not a declaration of type `i<Order, j>`

## Why

Reading the misparse as a declaration would report a dependency on any type that shares its name with a compared value, a false edge the gate cannot be told to ignore.
