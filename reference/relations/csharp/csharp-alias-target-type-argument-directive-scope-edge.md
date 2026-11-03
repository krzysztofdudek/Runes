---
id: csharp-alias-target-type-argument-directive-scope-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.2 (using alias directives: the target, type arguments included, is resolved as if the compilation unit or namespace body that holds the directive had no using directives); §7.8 (namespace and type names)"
---

## Rule

The type arguments of a using alias's target are part of the target, so they are read where the directive reads it: in the compilation unit or namespace body that holds the directive, nearest namespace first and the global namespace last, with no using directive or alias of that body taking part. A directive above `namespace App;` sits in the compilation unit, so `using R = Repo<Order>;` there names the global `Order`, never `App.Order` (the namespace below it) and never `Shop.Data.Order` (a using beside it). A directive inside a namespace body reads that body's namespaces first, as the target itself does (the case csharp-using-alias-target-in-namespace-edge).

## Files

```csharp path=src/c/Use.cs
using Shop.Data;
using R = Repo<Order>;
namespace App;
class C { }
```

```csharp path=src/b/Use.cs
namespace App.Web { using Shop.Data; using L = Repo<Order>; class D { } }
```

```csharp path=src/r/Repo.cs
public class Repo<T> { }
```

```csharp path=src/o/Order.cs
public class Order { }
```

```csharp path=src/app/Order.cs
namespace App;
public class Order { }
```

```csharp path=src/data/Order.cs
namespace Shop.Data;
public class Order { }
```

## Expect

- src/c/Use.cs:2 -> node:r       # the container Repo, read from the compilation unit
- src/c/Use.cs:2 -> node:o       # the type argument Order is the global one: the namespace below the directive (node app) and the using beside it (node data) take no part
- src/b/Use.cs:1 -> node:r       # the container Repo, the global one, as App.Web.Repo and App.Repo do not exist
- src/b/Use.cs:1 -> node:app     # inside namespace App.Web the type argument reads App.Order before the global Order; the using in the same body (node data) takes no part

## Why

The type arguments were read like an ordinary use, with the namespace of the file and every using directive of it, so a type that only shares the simple name could take the edge the compiler gives to another type.
