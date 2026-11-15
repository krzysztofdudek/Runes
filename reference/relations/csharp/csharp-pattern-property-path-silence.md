---
id: csharp-pattern-property-path-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §11.2.7 (property pattern, extended property pattern); MS Learn — patterns (property pattern: extended property patterns, C# 10)"
---

## Rule

In an extended property pattern the dotted path before the colon names members of the value tested, one after the other: `x is { Order.Id: 3 }` is `x is { Order: { Id: 3 } }`, and `Order` there is the property `Holder.Order`, looked up on the type of `x` and never in scope. A type named like a member of the path (`App.Orders.Order`, `App.Orders.Customer`, imported by `using App.Orders;`) is not what it names, in an `is` test, a switch arm, a `case` label, a nested property pattern or an element of a list pattern, so the paths give no edge.

## Files

```csharp path=src/orders/Order.cs
namespace App.Orders;
public class Order { }
public class Customer { }
```

```csharp path=src/web/Holder.cs
namespace App.Web;
public class Sale { public int Id { get; set; } public Buyer Customer { get; set; } }
public class Buyer { public string Name { get; set; } public int Age { get; set; } }
public class Holder { public Sale Order { get; set; } public Holder[] Items { get; set; } }
```

```csharp path=src/web/Check.cs
using App.Orders;
namespace App.Web;
public class Check {
  public bool A(Holder x) => x is { Order.Id: 3 };
  public int B(Holder x) => x switch { { Order.Customer.Name: "a" } => 1, _ => 0 };
  public bool C(Holder x) => x is { Order: { Customer.Age: > 18 } };
  public bool D(Holder x) => x is { Items: [{ Order.Id: 1 }, ..] };
  public int E(Holder x) { switch (x) { case { Order.Id: 2 }: return 1; default: return 0; } }
}
```

## Expect

- silence      # every path names members of Holder, Sale and Buyer, all of node web; the types Order and Customer of node orders are not what the paths name

## Why

The grammar reads the path before the colon as a member access, and a member access whose first name the file does not declare reads that name as a type, so `{ Order.Id: 3 }` gave an edge to any type named `Order` in reach, where `{ Order: { Id: 3 } }` gave none.
