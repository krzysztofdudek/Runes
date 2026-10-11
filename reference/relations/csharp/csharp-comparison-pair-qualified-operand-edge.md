---
id: csharp-comparison-pair-qualified-operand-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §6.2.5 (grammar ambiguities — `F(G < A, B > (7))`); §12.17 (declaration expressions are only `out` arguments and deconstruction targets); §12.12 (relational operators)"
---

## Rule

Two comparisons in one argument list whose operands are member accesses, `Pick(x < Limits.Max, y > z)` and `Pick(x < y, Limits.Max > z)`, are read by the grammar as a declaration of a generic type `x<Limits.Max, y>` named `z`. A plain argument never declares a variable, so that reading is rejected, and the operands are read as the two comparisons they are. The qualifier `Limits` of the member access `Limits.Max` is then an ordinary type receiver, so it names the type `Limits` that the file uses. The simple names `x`, `y`, `z` name values and bind nothing.

## Files

```csharp path=src/app/Range.cs
using Shop.Core;
namespace Shop.App;
class Range {
  static int Pick(bool a, bool b) => 1;
  int M(int x, int y, int z) => Pick(x < Limits.Max, y > z);
  int N(int x, int y, int z) => Pick(x < y, Limits.Max > z);
}
```

```csharp path=src/limits/Limits.cs
namespace Shop.Core;
public class Limits { public const int Max = 3; }
```

## Expect

- src/app/Range.cs:5 -> node:limits     # `x < Limits.Max, y > z` read as two comparisons: Limits is a type receiver
- src/app/Range.cs:6 -> node:limits     # `Limits.Max > z` as the second comparison: the same receiver

## Why

The declaration misreading would otherwise hide a real type reference behind a dotted operand, and a comparison of a constant of a type is the usual way a file names that type in an argument list.
