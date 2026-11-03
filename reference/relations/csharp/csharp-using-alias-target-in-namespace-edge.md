---
id: csharp-using-alias-target-in-namespace-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.2 (using alias directives — the target is resolved in the immediately containing compilation unit or namespace body, unaffected by other using directives); §7.8 (namespace and type names — enclosing namespaces first)"
---

## Rule

The target of a using alias is resolved in the namespace body that holds the directive. A directive below `namespace App;` (or inside a namespace block) reads its target from the nearest enclosing namespace outward and the global namespace last, so `using O = Shared.Order;` there names `App.Shared.Order` when that type exists, and only otherwise `Shared.Order`. The nearer type wins and the global one gets no edge. The directive line itself reads only that nearest reading, because a plain target may name a namespace and a nearer namespace of that name hides every farther type: with only the global `Shared.Order` present the directive line gives no edge and each use of `O` gives it (the case csharp-alias-namespace-beside-global-type-edge). A directive above the namespace, in the compilation unit, reads from the global namespace (the case csharp-using-alias). The using directives of an outer compilation unit would also take part in C# (`using Shop.Core; namespace App; using O = Order;` binds `Shop.Core.Order`); reading none of them is a deliberate conservatism here, a silence and never a false edge.

## Files

```csharp path=src/c/Use.cs
namespace App;
using O = Shared.Order;
class C { }
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

- src/c/Use.cs:2 -> node:near      # `Shared.Order` inside `namespace App;` binds App.Shared.Order first; the global Shared.Order gets no edge

## Why

Reading every alias target from the root would bind the far type, or miss the near one, whenever an enclosing namespace holds a namespace of the same first name, which is how a project's own `Shared` or `Core` namespace shadows a library's.
