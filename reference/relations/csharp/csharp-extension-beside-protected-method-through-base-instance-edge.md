---
id: csharp-extension-beside-protected-method-through-base-instance-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.5.4 (a protected instance member is reached through an instance only when the instance's type is the class the access occurs in, or a class derived from it; error CS1540 otherwise); §12.8.10.3"
---

## Rule

`Order` of node core declares a protected `Validate()`. Inside `RushOrder : Order`, `other.Validate()` on a parameter typed `Order` cannot reach it: a protected member is reached through an instance of the calling class or of a class derived from it, and `Order` is neither. The call is the extension `Validate(this Order)` of node ext. On line 5 the receiver is a `RushOrder`, the calling class itself, so the protected method takes the call and no edge is due.

## Files

```csharp path=src/core/Order.cs
namespace App;
public class Order { protected bool Validate() => true; }
```

```csharp path=src/ext/OrderExtensions.cs
namespace App;
public static class OrderExtensions { public static bool Validate(this Order o) => true; }
```

```csharp path=src/rush/RushOrder.cs
namespace App;
public class RushOrder : Order {
  public bool Run(Order other, RushOrder same) {
    bool a = other.Validate();
    return same.Validate() && a;
  }
}
```

## Expect

- src/ext/OrderExtensions.cs:2 -> node:core
- src/rush/RushOrder.cs:2 -> node:core    # the base class
- src/rush/RushOrder.cs:3 -> node:core    # the parameter's type
- src/rush/RushOrder.cs:4 -> node:ext     # the extension method: the protected one is out of reach through an Order

## Why

Deriving from a class gives access to its protected members on one's own instances, not on every instance of the base class.
