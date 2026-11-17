---
id: csharp-pattern-type-in-derived-class-without-the-name-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.4 (simple names: the members of the enclosing type, inherited ones included, are read before any namespace member); §11.2.3 (constant pattern), §11.2.5 (positional pattern), §11.2.6 (type pattern, C# 9)"
---

## Rule

`Router` derives from `Fields` of node core, which declares the constant `Line` and nothing named `Order`. Inside `Router`, `case Order:`, the switch arm `Order =>`, the positional patterns `x is (Order, _)` and `(Order, _) =>` find no member `Order` in `Router` or its base, so they are type patterns of the class `App.Models.Order` of node order and give its edge.

## Files

```csharp path=src/core/Fields.cs
namespace App.Core;
public class Fields { public const string Line = "line"; }
```

```csharp path=src/order/Order.cs
namespace App.Models;
public class Order { }
```

```csharp path=src/web/Router.cs
using App.Core;
using App.Models;
namespace App.Web;
public class Router : Fields {
  public int A(object x) { switch (x) { case Order: return 1; default: return 0; } }
  public int B(object x) => x switch { Order => 1, _ => 0 };
  public bool C(object x) => x is (Order, _);
  public int D(object x) => x switch { (Order, _) => 1, _ => 0 };
}
```

## Expect

- src/web/Router.cs:4 -> node:core       # the base class
- src/web/Router.cs:5 -> node:order      # a case label
- src/web/Router.cs:6 -> node:order      # a switch expression arm
- src/web/Router.cs:7 -> node:order      # a positional pattern after is
- src/web/Router.cs:8 -> node:order      # a positional pattern in a switch arm

## Why

Deriving from a class of the repository costs a pattern's type nothing unless that class declares the name.
