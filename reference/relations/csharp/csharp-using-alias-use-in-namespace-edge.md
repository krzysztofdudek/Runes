---
id: csharp-using-alias-use-in-namespace-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — the target is resolved in the namespace body that holds the directive); §7.8 (namespace and type names — an alias names the type its directive names)"
---

## Rule

A using alias names one type, and every line of the file reads it the same way. Below `namespace App;` the target of `using O = Shared.Order;` is read in that namespace body, so it is `App.Shared.Order` when that type exists and `Shared.Order` only otherwise; a use of `O` binds the type the directive binds. The nearer type gets the edge on the directive line and on the use line, and the global `Shared.Order` gets none.

## Files

```csharp path=src/c/Use.cs
namespace App;
using O = Shared.Order;
class C { O x; }
```

```csharp path=src/near/Order.cs
namespace App.Shared;
public class Order { }
```

```csharp path=src/far/Order.cs
namespace Shared;
public class Order { }
```

## Expect

- src/c/Use.cs:2 -> node:near      # the directive binds App.Shared.Order
- src/c/Use.cs:3 -> node:near      # the use of `O` binds the same type, not the global Shared.Order

## Why

Reading the alias target from the root on a use line, while the directive line reads the nearer namespace, adds an edge to a type the compiler does not bind.
