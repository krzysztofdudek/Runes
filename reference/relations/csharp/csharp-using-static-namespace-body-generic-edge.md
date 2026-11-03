---
id: csharp-using-static-namespace-body-generic-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.4 (using static directives: the type is resolved as a using alias target is, in the compilation unit or namespace body that holds the directive, as if it had no using directives); §14.5.2; §7.8 (namespace and type names)"
---

## Rule

The type a `using static` directive names is resolved where the directive stands, as a using alias target is. A directive below `namespace App;` (or inside a namespace block) reads the nearest enclosing namespace first and the global namespace last, so `using static Shared.Helpers;` there names `App.Shared.Helpers` when that type exists, and the global `Shared.Helpers` gets no edge. A generic type (`using static Repo<Order>;`) depends on the generic type by its plain name and on each type argument, read the same way. A directive in the compilation unit reads from the global namespace (the case csharp-using-static-target-edge); the using directives beside it take no part.

## Files

```csharp path=src/c/Use.cs
namespace App;
using static Shared.Helpers;
using static Repo<Order>;
class C { }
```

```csharp path=src/near/Helpers.cs
namespace App.Shared;
public static class Helpers { }
```

```csharp path=src/far/Helpers.cs
namespace Shared;
public static class Helpers { }
```

```csharp path=src/r/Repo.cs
public class Repo<T> { }
```

```csharp path=src/o/Order.cs
public class Order { }
```

## Expect

- src/c/Use.cs:2 -> node:near     # `Shared.Helpers` below `namespace App;` is App.Shared.Helpers; the global Shared.Helpers (node far) gets no edge
- src/c/Use.cs:3 -> node:r        # the generic type Repo, by its plain name
- src/c/Use.cs:3 -> node:o        # its type argument Order

## Why

The target was read from the global namespace only, even inside a namespace body, which bound a same-named type the compiler never reaches there; and a generic target was kept as the written text `Repo<Order>`, a key no declaration has, so it gave no edge at all.
