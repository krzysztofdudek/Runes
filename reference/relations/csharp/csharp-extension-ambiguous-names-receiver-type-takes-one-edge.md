---
id: csharp-extension-ambiguous-names-receiver-type-takes-one-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: the candidates are the extension methods in scope whose first parameter the receiver converts to; overload resolution picks among them)"
---

## Rule

Two imported namespaces each declare an extension method `Tag`, one on `Order` and one on `Customer`. `o.Tag()` on a parameter written `Order o` has one candidate: the one whose `this` parameter takes an `Order`. A `Customer` extension takes no `Order` (an `Order` neither derives from `Customer` nor converts to it), so the call binds the `Order` one, and the edge goes to node a.

## Files

```csharp path=src/model/Model.cs
namespace App;
public class Order { }
public class Customer { }
```

```csharp path=src/a/OrderTags.cs
using App;
namespace App.A;
public static class OrderTags {
  public static void Tag(this Order o) { }
}
```

```csharp path=src/b/CustomerTags.cs
using App;
namespace App.B;
public static class CustomerTags {
  public static void Tag(this Customer c) { }
}
```

```csharp path=src/web/Page.cs
using App;
using App.A;
using App.B;
namespace App.Web;
public class Page {
  public void Run(Order o) {
    o.Tag();
  }
}
```

## Expect

- src/a/OrderTags.cs:4 -> node:model      # `Order` in the parameter list
- src/b/CustomerTags.cs:4 -> node:model      # `Customer` in the parameter list
- src/web/Page.cs:6 -> node:model      # `Order o`
- src/web/Page.cs:7 -> node:a      # the `Tag` whose `this` parameter takes an `Order`

## Why

Both namespaces are imported at one level, so the reading named two owners and stayed ambiguous, though the receiver's written type says which of them the compiler takes.
