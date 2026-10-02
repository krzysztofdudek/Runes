---
id: csharp-comparison-pair-qualified-argument-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §6.2.5 (grammar ambiguities — `F(G < A, B > (7))`); §12.17 (declaration expressions are only `out` arguments and deconstruction targets)"
---

## Rule

The parser reads two comparisons in one argument list whose first operand is a member access, `Within(x.Low < Order, j > Max)`, as a declaration expression of a qualified generic type `x.Low<Order, j>` named `Max`; with a member access on the right too (`y.High > Max`) the second operand becomes a qualified type argument. A plain argument never declares a variable, so nothing in that reading is a type reference: neither `x.Low`, `Order`, `j` nor `y.High`, even when another node declares a type `Order` under an imported namespace.

## Files

```csharp path=src/app/Range.cs
using Shop.Core;
namespace Shop.App;
class Range {
  int Order => 1;
  int Low => 0;
  int High => 4;
  const int Max = 3;
  static bool Within(bool a, bool b) => a && b;
  bool M(Range x, int j) => Within(x.Low < Order, j > Max);
  bool N(Range x, Range y) => Within(x.Low < Order, y.High > Max);
  bool P(Range x, int j) => new Probe(x.Low < Order, j > Max).Ok;
}
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order {}
```

## Expect

- silence      # `x.Low < Order, j > Max` are two comparisons, not a declaration of type `x.Low<Order, j>`

## Why

The unqualified pair (csharp-comparison-pair-argument-silence) was already read as comparisons; the qualified one still reached the general reading of qualified names, which reported `Order` as a type and invented a dependency on any type that shares its name with a compared value.
