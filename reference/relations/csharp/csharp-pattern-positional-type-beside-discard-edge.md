---
id: csharp-pattern-positional-type-beside-discard-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §11.2.5 (positional pattern), §11.2.6 (type pattern, C# 9); MS Learn — patterns (positional patterns)"
---

## Rule

A type written as a subpattern of a positional pattern beside a discard or a constant is a type pattern: `x is (Order, _)`, `x is (Models.Order, _)`, `x is (App.Models.Order, 1)`, a switch arm `(Models.Order, _) =>`, a `case (Models.Order, _):` and a nested `x is ((Order, _), 2)` each test the type `Order` and give its edge. A dotted name is read as the type it spells, its first name first.

## Files

```csharp path=src/c/Use.cs
using App.Models;
namespace App;
class C {
  bool A(object x) => x is (Order, _);
  bool B(object x) => x is (Models.Order, _);
  bool D(object x) => x is (App.Models.Order, 1);
  int E(object x) => x switch { (Models.Order, _) => 1, _ => 0 };
  void F(object x) { switch (x) { case (Models.Order, _): break; } }
  bool G(object x) => x is ((Order, _), 2);
}
```

```csharp path=src/order/Order.cs
namespace App.Models;
public class Order {}
```

## Expect

- src/c/Use.cs:4 -> node:order      # a simple name beside a discard
- src/c/Use.cs:5 -> node:order      # a dotted name beside a discard, read in namespace App
- src/c/Use.cs:6 -> node:order      # a fully dotted name beside a constant
- src/c/Use.cs:7 -> node:order      # a switch expression arm
- src/c/Use.cs:8 -> node:order      # a case label of a switch statement
- src/c/Use.cs:9 -> node:order      # a positional pattern nested in another

## Why

The grammar reads the parenthesized list as a constant pattern over a tuple expression, which the reading of constant patterns did not take, and a dotted name inside it was read only by its first name, as the receiver of a member access, so none of these tests gave the edge. A declaration pattern in the same place (`x is (Models.Order o, _)`) is read as a positional subpattern and kept its edge.
