---
id: csharp-extension-ambiguous-names-receiver-derived-type-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: the candidates are the extension methods in scope whose first parameter the receiver converts to); §10.2.8 (an implicit reference conversion from a type to its base class)"
---

## Rule

An extension method on a base class takes a receiver of a derived class, and one on an unrelated class does not. `o.Tag()` on `SpecialOrder o`, which derives from `Order`, has one candidate, the one on `Order`.

## Files

```csharp path=src/model/Model.cs
namespace App;
public class Order { }
public class SpecialOrder : Order { }
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
  public void Run(SpecialOrder o) {
    o.Tag();
  }
}
```

## Expect

- src/a/OrderTags.cs:4 -> node:model      # `Order` in the parameter list
- src/b/CustomerTags.cs:4 -> node:model      # `Customer` in the parameter list
- src/web/Page.cs:6 -> node:model      # `SpecialOrder o`
- src/web/Page.cs:7 -> node:a      # `SpecialOrder` derives from `Order`: the extension on `Order` takes it, the one on `Customer` does not

## Why

The receiver's type says which candidate the compiler takes only through its bases; a reading that compared the written types alone would have refused the extension on `Order`.
