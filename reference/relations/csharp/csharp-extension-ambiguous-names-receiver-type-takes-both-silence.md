---
id: csharp-extension-ambiguous-names-receiver-type-takes-both-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §12.8.10.3 (extension method invocations: when two candidates are equally good the call is ambiguous, CS0121)"
---

## Rule

When the receiver's written type fits both extension methods, nothing chooses between them and the ambiguity stands: `o.Tag()` on an `Order` has two candidates, both on `Order`, and gives no edge.

## Files

```csharp path=src/model/Model.cs
namespace App;
public class Order { }
```

```csharp path=src/a/OrderTags.cs
using App;
namespace App.A;
public static class OrderTags {
  public static void Tag(this Order o) { }
}
```

```csharp path=src/b/MoreOrderTags.cs
using App;
namespace App.B;
public static class MoreOrderTags {
  public static void Tag(this Order o) { }
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
- src/b/MoreOrderTags.cs:4 -> node:model      # `Order` in the parameter list
- src/web/Page.cs:6 -> node:model      # `Order o`

## Why

Narrowing by the receiver's type must leave an ambiguity alone when it removes no candidate: both owners stay, and the call binds neither.
