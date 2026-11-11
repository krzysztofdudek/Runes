---
id: csharp-extension-other-argument-count-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §12.8.10.3 (an extension method invocation is bound among the extension methods that are applicable to the call); §12.6.4.2 (an applicable function member has a parameter for each argument, and an argument for each parameter without a default)"
---

## Rule

An extension method is a candidate for a call only when it can take the call's arguments. Node ext declares `Describe(this Order o)` and `Tag(this Order o, string a, string b)`. `order.Describe("short", 2)` passes two arguments beside the receiver and `order.Tag("x")` one, so neither is a call of those methods: the methods the calls bind live outside the repository (a package's), and the calls give no edge.

## Files

```csharp path=src/core/Order.cs
namespace App;
public sealed class Order { }
```

```csharp path=src/ext/OrderExtensions.cs
namespace App.Ext;
public static class OrderExtensions {
  public static string Describe(this App.Order o) => "";
  public static string Tag(this App.Order o, string a, string b) => a + b;
}
```

```csharp path=src/core/Report.cs
using App.Ext;
using Vendor.Orders;
namespace App;
public class Report {
  public string Line(object source) {
    var order = (Order)source;
    return order.Describe("short", 2) + order.Tag("x");
  }
}
```

## Expect

- src/ext/OrderExtensions.cs:3 -> node:core
- src/ext/OrderExtensions.cs:4 -> node:core
- silence      # src/core/Report.cs:7 names no extension method of node ext

## Why

The lookup matched an extension method by its name alone, so a call with two arguments bound a method of one parameter, and the consumer's graph showed a dependency that does not exist.
