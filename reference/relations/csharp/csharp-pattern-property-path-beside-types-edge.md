---
id: csharp-pattern-property-path-beside-types-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §11.2.7 (property pattern, extended property pattern), §11.2.3 (constant pattern), §11.2.5 (type pattern)"
---

## Rule

`x is { Order.Id: 3 }` on a `Holder` whose property `Order` has the type `App.Orders.Order` names that property, not the type, so the path gives no edge of its own; the type reaches the file only where it is written. The pattern after the colon is read as a pattern anywhere: a constant of an enum (`{ Order.Kind: Kind.A }`, `{ Order: { Kind: Kind.B } }`, a switch arm) gives the edge to the enum and none to `Order`, and a type pattern (`{ Order: Orders.Order }`) gives the edge to the type it names.

## Files

```csharp path=src/kinds/Kind.cs
namespace App.Kinds;
public enum Kind { A, B }
```

```csharp path=src/orders/Order.cs
using App.Kinds;
namespace App.Orders;
public class Order { public int Id { get; set; } public Kind Kind { get; set; } }
public class Holder { public Order Order { get; set; } }
```

```csharp path=src/web/Check.cs
using App.Orders;
using App.Kinds;
namespace App.Web;
public static class Check {
  public static bool A(Holder x) =>
    x is { Order.Id: 3 };
  public static bool B(Holder x) =>
    x is { Order.Kind: Kind.A };
  public static bool C(Holder x) =>
    x is { Order: { Kind: Kind.B } };
  public static bool D(Holder x) =>
    x is { Order: Orders.Order };
  public static int E(Holder x) =>
    x switch { { Order.Kind: Kind.B } => 1, _ => 0 };
}
```

## Expect

- src/orders/Order.cs:3 -> node:kinds      # the property's type Kind
- src/web/Check.cs:5 -> node:orders      # the parameter's type Holder
- src/web/Check.cs:7 -> node:orders      # the parameter's type Holder
- src/web/Check.cs:8 -> node:kinds      # the constant Kind.A after the path, and nothing for the path
- src/web/Check.cs:9 -> node:orders      # the parameter's type Holder
- src/web/Check.cs:10 -> node:kinds      # the constant Kind.B in a nested property pattern
- src/web/Check.cs:11 -> node:orders      # the parameter's type Holder
- src/web/Check.cs:12 -> node:orders      # the type pattern Orders.Order
- src/web/Check.cs:13 -> node:orders      # the parameter's type Holder
- src/web/Check.cs:14 -> node:kinds      # the constant Kind.B in a switch arm, and nothing for the path

## Why

The path before the colon was read as a member access whose first name, which the file does not declare, is a type, so `{ Order.Id: 3 }` gave the edge to `Order` that `{ Order: { Id: 3 } }` does not; the edges of the patterns after the colon must stay.
