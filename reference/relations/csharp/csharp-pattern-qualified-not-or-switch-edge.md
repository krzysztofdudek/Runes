---
id: csharp-pattern-qualified-not-or-switch-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §11 (patterns: a type pattern, a negated, disjunctive and switch-arm pattern each name a type)"
---

## Rule

Each line names a type of node models in a pattern position: a fully qualified type, a negated pattern, a disjunctive pattern, a switch-expression arm and an array type.

## Files

```csharp path=src/models/Models.cs
namespace App.Models;
public class Order { }
public class Invoice { }
public class Refund { }
public class Credit { }
public class Note { }
```

```csharp path=src/web/Check.cs
using App.Models;
namespace App.Web;
public class Check {
  public bool A(object o) => o is App.Models.Order;
  public bool B(object o) => o is not Invoice;
  public bool C(object o) => o is Refund or string;
  public int D(object o) => o switch { Credit => 1, _ => 0 };
  public bool E(object o) => o is Note[];
}
```

## Expect

- src/web/Check.cs:4 -> node:models      # `is App.Models.Order`
- src/web/Check.cs:5 -> node:models      # `is not Invoice`
- src/web/Check.cs:6 -> node:models      # `is Refund or string`
- src/web/Check.cs:7 -> node:models      # a switch arm `Credit =>`
- src/web/Check.cs:8 -> node:models      # `is Note[]`

## Why

A pattern names a type through any of these shapes; each one reads the same type reference.
