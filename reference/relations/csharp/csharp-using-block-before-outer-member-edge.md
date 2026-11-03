---
id: csharp-using-block-before-outer-member-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.8.1 (namespace and type names: at each enclosing namespace, its members, then the using directives of the declaration of that namespace, before the next namespace outward)"
---

## Rule

C# reads the using directives of a namespace declaration right after the members of that namespace, before the next namespace outward. In `namespace App.Web { using Lib; }` a reference to `Order` reads `App.Web.Order`, then the types `Lib` imports, and only then `App.Order`: with both `Lib.Order` and `App.Order` declared, it binds `Lib.Order`.

## Files

```csharp path=src/a/Use.cs
namespace App.Web
{
    using Lib;
    class C { Order o; }
}
```

```csharp path=src/app/Order.cs
namespace App;
public class Order { }
```

```csharp path=src/lib/Order.cs
namespace Lib;
public class Order { }
```

## Expect

- src/a/Use.cs:4 -> node:lib      # the using of block App.Web comes before the outer namespace App; App.Order (node app) is never reached

## Why

The using directives of every block were read after all the enclosing namespaces, so a type of an outer namespace hid the type the block's own using imports.
