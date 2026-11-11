---
id: csharp-pattern-generic-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.12.12 (the is operator with a type: `e is T`)"
---

## Rule

`o is System.Collections.Generic.IEnumerable<Order>` names `Order`, and `o is Box<Item>` names `Box` (with its arity) and `Item`.

## Files

```csharp path=src/models/Models.cs
namespace App.Models;
public class Order { }
public class Box<T> { }
public class Item { }
```

```csharp path=src/web/Check.cs
using App.Models;
namespace App.Web;
public class Check {
  public bool A(object o) => o is System.Collections.Generic.IEnumerable<Order>;
  public bool B(object o) => o is Box<Item>;
}
```

## Expect

- src/web/Check.cs:4 -> node:models      # the type argument `Order`
- src/web/Check.cs:5 -> node:models      # `Box`1` and the type argument `Item`

## Why

A generic type after `is` is a constant pattern over a generic name; its container and each type argument are references.
