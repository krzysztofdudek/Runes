---
id: csharp-derived-class-type-receiver-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.4 (simple names: the members of the enclosing type, inherited ones included and from every part of a partial type, are read before any namespace member)"
---

## Rule

`Invoice` derives from `Document` of node core, which declares members `Total` and `Print`. `OrderStatus.Paid` and `Guard.NotNull(this)` name nothing `Invoice` or `Document` declares, so they stay what they read as: the enum of node model and the static class of node util.

## Files

```csharp path=src/core/Document.cs
namespace App;
public class Document { protected int Total; public void Print() { } }
```

```csharp path=src/model/OrderStatus.cs
namespace App;
public enum OrderStatus { Paid }
```

```csharp path=src/util/Guard.cs
namespace App;
public static class Guard { public static void NotNull(object o) { } }
```

```csharp path=src/web/Invoice.cs
namespace App;
public class Invoice : Document {
  public OrderStatus State() => OrderStatus.Paid;
  public void Check() { Guard.NotNull(this); }
}
```

## Expect

- src/web/Invoice.cs:2 -> node:core
- src/web/Invoice.cs:3 -> node:model       # the enum, as a return type and as a receiver
- src/web/Invoice.cs:4 -> node:util        # the static class

## Why

Deriving from a class of the repository costs a type receiver nothing unless that class declares the name.
