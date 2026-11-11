---
id: csharp-extension-receiver-type-without-that-method-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (an extension method is considered only when the normal processing of the invocation finds no applicable instance method)"
---

## Rule

`order.Audit()` on a parameter of type `Order`: neither `Order`, nor its base class `Entity`, nor its interface `IEntity`, nor its other part declares a method `Audit` (a static `Audit` and a private one of another type's do not count), so the call is the extension `Audit(this Order)` of node ext.

## Files

```csharp path=src/core/Order.cs
namespace App.Core;
public interface IEntity { int Id(); }
public class Entity { public void Touch() { } static void Audit() { } }
public partial class Order : Entity, IEntity { public int Id() => 1; }
```

```csharp path=src/core/Order.Part.cs
namespace App.Core;
public partial class Order { public static void Audit(int level) { } }
```

```csharp path=src/ext/OrderExtensions.cs
namespace App.Core;
public static class OrderExtensions { public static void Audit(this Order o) { } }
```

```csharp path=src/web/Checkout.cs
using App.Core;
namespace App.Web;
public class Checkout {
  public void Run(Order order) {
    order.Audit();
  }
}
```

## Expect

- src/ext/OrderExtensions.cs:2 -> node:core
- src/web/Checkout.cs:4 -> node:core
- src/web/Checkout.cs:5 -> node:ext       # the extension method

## Why

With no instance method of the name, extension methods are what the compiler turns to.
