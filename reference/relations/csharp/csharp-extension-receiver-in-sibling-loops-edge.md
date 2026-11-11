---
id: csharp-extension-receiver-in-sibling-loops-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §13.9.4 (the scope of a local variable declared in a for initializer is the for statement); §12.8.10.3"
---

## Rule

Two `for` loops of one method each declare `x`, the first as an `Order`, which has an instance `Validate`, the second as a `Customer`, which has none. Each call reads the `x` of its own loop: the first is the instance method's and gives no edge, the second is the extension `Validate(this Customer)` of node ext.

## Files

```csharp path=src/core/Order.cs
namespace App;
public class Order { public bool Validate() => true; public Order Next; }
public class Customer { public Customer Next; }
```

```csharp path=src/ext/CustomerExtensions.cs
namespace App;
public static class CustomerExtensions { public static bool Validate(this Customer c) => true; }
```

```csharp path=src/web/Sweep.cs
namespace App;
public class Sweep {
  public void Run(Order first, Customer head) {
    for (Order x = first; x != null; x = x.Next) { x.Validate(); }
    for (Customer x = head; x != null; x = x.Next) { x.Validate(); }
  }
}
```

## Expect

- src/ext/CustomerExtensions.cs:2 -> node:core
- src/web/Sweep.cs:3 -> node:core
- src/web/Sweep.cs:4 -> node:core         # the loop variable's type; the call is an instance method's
- src/web/Sweep.cs:5 -> node:core         # the loop variable's type
- src/web/Sweep.cs:5 -> node:ext          # the extension method

## Why

A variable of a for initializer is in scope in its own statement and no further.
