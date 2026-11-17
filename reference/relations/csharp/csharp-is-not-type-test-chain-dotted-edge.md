---
id: csharp-is-not-type-test-chain-dotted-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# — the `is` type test, the `not` pattern (C# 9), member access and the `||` and `&&` operators; MS Learn — patterns (a negated type pattern)"
---

## Rule

A dotted type tested with `is not` gives its edge in a chain as it does alone: `x is not App.Models.Order || x is not App.Models.Line` and `x is not App.Models.Order && x is not App.Models.Line` test both types, as a lone `x is not App.Models.Order` tests `Order`. Each dotted name is read as the type it spells, its first name first.

## Files

```csharp path=src/c/Use.cs
namespace Web;
class C {
  bool A(object x) => x is not App.Models.Order;
  bool O(object x) => x is not App.Models.Order || x is not App.Models.Line;
  bool N(object x) => x is not App.Models.Order && x is not App.Models.Line;
}
```

```csharp path=src/order/Order.cs
namespace App.Models;
public class Order {}
```

```csharp path=src/line/Line.cs
namespace App.Models;
public class Line {}
```

## Expect

- src/c/Use.cs:3 -> node:order      # a lone negated test
- src/c/Use.cs:4 -> node:order      # the first of two negated tests joined by ||
- src/c/Use.cs:4 -> node:line       # the second
- src/c/Use.cs:5 -> node:order      # the first of two negated tests joined by &&
- src/c/Use.cs:5 -> node:line       # the second

## Why

The grammar reads `x is not App.Models.Order || x is not App.Models.Line` as member accesses on the tests `x is not App`, as it reads the chain without `not`, but the constant pattern sits under the negated pattern, where the reading of such torn chains did not look, so neither type was read.
