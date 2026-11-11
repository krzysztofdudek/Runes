---
id: csharp-extension-instance-method-other-file-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (an extension method is considered only when the normal processing of the invocation finds no applicable instance method)"
---

## Rule

`order.Validate()` on a parameter of type `Order` calls the instance method `Order.Validate` of node core. The extension `Validate(this Customer)` of node ext, in scope through the using, is never considered, so line 5 gives no edge.

## Files

```csharp path=src/core/Order.cs
namespace App.Core;
public class Order { public bool Validate() => true; }
```

```csharp path=src/ext/CustomerExtensions.cs
namespace App.Core;
public class Customer { }
public static class CustomerExtensions { public static bool Validate(this Customer c) => true; }
```

```csharp path=src/web/Checkout.cs
using App.Core;
namespace App.Web;
public class Checkout {
  public bool Run(Order order) {
    return order.Validate();
  }
}
```

## Expect

- src/web/Checkout.cs:4 -> node:core      # the parameter's type; line 5 binds its instance method

## Why

The receiver's type is written in the file, and that type declares the method.
