---
id: csharp-ref-return-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §15.6.1 (a method may return by reference: `ref T`, `ref readonly T`)"
---

## Rule

A ref-returning method's return type names `Order`.

## Files

```csharp path=src/models/Order.cs
namespace App.Models;
public class Order { }
```

```csharp path=src/web/Store.cs
using App.Models;
namespace App.Web;
public class Store {
  public ref Order First() => throw null;
}
```

## Expect

- src/web/Store.cs:4 -> node:models      # `ref Order`

## Why

`ref` wraps the type; the type inside is the dependency.
