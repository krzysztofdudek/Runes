---
id: csharp-pattern-constant-inherited-from-base-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.4 (simple names: the members of the enclosing type, inherited ones included, are read before any namespace member); §11.2.3 (constant pattern), §11.2.5 (positional pattern); §12.12.12 (the is-type operator binds its right operand as a type first)"
---

## Rule

`Router` derives from `Fields` of node core, which declares the constant `Order`. Inside `Router`, `case Order:`, the switch arm `Order =>`, the positional patterns `t is (Order, _)` and `(Order, _) =>` read that inherited constant, not the class `App.Models.Order` of node order that `using App.Models;` imports, so lines 5 to 8 give no edge. `x is Order` on line 9 is the is-type operator, which looks the name up as a type first and finds the class.

## Files

```csharp path=src/core/Fields.cs
namespace App.Core;
public class Fields { public const string Order = "order"; }
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
  public int A(string s) { switch (s) { case Order: return 1; default: return 0; } }
  public int B(string s) => s switch { Order => 1, _ => 0 };
  public bool C((string, int) t) => t is (Order, _);
  public int D((string, int) t) => t switch { (Order, _) => 1, _ => 0 };
  public bool E(object x) => x is Order;
}
```

## Expect

- src/web/Router.cs:4 -> node:core       # the base class; lines 5 to 8 read its constant
- src/web/Router.cs:9 -> node:order      # the is-type operator reads the name as a type

## Why

A constant pattern binds its name as an expression, and the members of the enclosing type, inherited ones included, come before every namespace and using. The base class is declared in another file, so only the resolver, reading the members `Fields` declares, can tell that the name is its constant.
