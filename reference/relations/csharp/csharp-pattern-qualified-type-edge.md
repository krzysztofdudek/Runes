---
id: csharp-pattern-qualified-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §11.2.5 (type pattern), §12.12.12 (the is operator with a type)"
---

## Rule

`o is App.Models.Order`, `o is Models.Order m` and the switch arm `Models.Order =>` name `Order` by a qualified name, the second and third read from the enclosing namespace `App`.

## Files

```csharp path=src/models/Order.cs
namespace App.Models;
public class Order { }
```

```csharp path=src/web/Check.cs
namespace App.Web;
public class Check {
  public bool A(object o) => o is App.Models.Order;
  public bool B(object o) => o is Models.Order m;
  public bool C(object o) => o switch { Models.Order => true, _ => false };
}
```

## Expect

- src/web/Check.cs:3 -> node:models      # `is App.Models.Order`
- src/web/Check.cs:4 -> node:models      # `is Models.Order m`
- src/web/Check.cs:5 -> node:models      # the arm `Models.Order =>`

## Why

The grammar reads a qualified name in a bare pattern as a member access, not as a type, so it needs a reading of its own.
