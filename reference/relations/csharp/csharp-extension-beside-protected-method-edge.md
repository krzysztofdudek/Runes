---
id: csharp-extension-beside-protected-method-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.5.4 (a protected member is accessible within its class and the classes derived from it); §12.8.10.3 (an extension method is considered when no accessible instance method applies)"
---

## Rule

`Order` of node core declares a protected `Validate()`. `Checkout`, which does not derive from `Order`, cannot call it, so `order.Validate()` there is the extension `Validate(this Order)` of node ext. In `RushOrder`, which derives from `Order`, the same call is the protected method's and gives no edge.

## Files

```csharp path=src/core/Order.cs
namespace App;
public class Order { protected bool Validate() => true; }
```

```csharp path=src/ext/OrderExtensions.cs
namespace App;
public static class OrderExtensions { public static bool Validate(this Order o) => true; }
```

```csharp path=src/web/Checkout.cs
namespace App;
public class Checkout {
  public bool Run(Order order) {
    return order.Validate();
  }
}
```

```csharp path=src/rush/RushOrder.cs
namespace App;
public class RushOrder : Order {
  public bool Run(RushOrder other) {
    return other.Validate();
  }
}
```

## Expect

- src/ext/OrderExtensions.cs:2 -> node:core
- src/web/Checkout.cs:3 -> node:core
- src/web/Checkout.cs:4 -> node:ext       # the extension method
- src/rush/RushOrder.cs:2 -> node:core    # the base class; line 4 calls the protected method

## Why

A method the calling code cannot access does not take the call.
