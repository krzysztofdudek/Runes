---
id: csharp-is-type-test-chain-dotted-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# — the `is` type test, member access and the `||` operator; MS Learn — patterns (a type pattern after `is`)"
---

## Rule

A dotted type tested with `is` gives its edge in a chain as it does alone: `x is Models.Order || b` tests `Models.Order`, and `x is App.Models.Order || x is App.Models.Line` tests both types. Each dotted name is read as the type it spells, its first name first, as a lone `x is Models.Line` is.

## Files

```csharp path=src/c/Use.cs
namespace App;
class C {
  bool M(object x, bool b) => x is Models.Order || b;
  bool P(object x) => x is App.Models.Order || x is App.Models.Line;
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

- src/c/Use.cs:3 -> node:order      # a dotted type at the head of a chain, read in namespace App
- src/c/Use.cs:4 -> node:order      # the first of two dotted tests
- src/c/Use.cs:4 -> node:line       # the second

## Why

The grammar reads `x is Models.Order || b` as a test of the constant `Models.Order || b`, whose first operand is a member access, and `x is App.Models.Order || x is App.Models.Line` as member accesses on the tests `x is App`, so neither dotted type was read as a type.
