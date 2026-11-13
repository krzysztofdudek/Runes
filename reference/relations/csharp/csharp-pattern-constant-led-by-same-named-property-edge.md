---
id: csharp-pattern-constant-led-by-same-named-property-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.7.2 (identical simple names and type names); MS Learn — patterns (a constant pattern)"
---

## Rule

`x is Status.Active` in a type that declares `public Status Status { get; set; }` names the constant `Active` of the type `Status`: a constant pattern can only name a constant, and C# reads the first name as the type when a property of that name has that type. The pattern gives the edge to the type alone and in a chain of tests.

## Files

```csharp path=src/model/Status.cs
namespace App.Model;
public enum Status { Active, Done }
```

```csharp path=src/web/Order.cs
namespace App.Web;
public class Order {
  public App.Model.Status Status { get; set; }
  public bool Open(object x) => x is Status.Active;
  public bool Seen(object x) => x is Status.Active || x is Status.Done;
}
```

## Expect

- src/web/Order.cs:3 -> node:model      # the property's type
- src/web/Order.cs:4 -> node:model      # the constant of the type the property is named after
- src/web/Order.cs:5 -> node:model      # the same in a chain of tests

## Why

The first name of a dotted constant was read as no type wherever the file declares a value of that name, so the property hid its own type from every pattern of the class.
