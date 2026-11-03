---
id: csharp-alias-namespace-beside-global-type-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §14.5.2 (using alias directives: the target may name a namespace or a type, resolved in the namespace body that holds the directive); §7.8.1 (namespace and type names: at each enclosing namespace a member namespace or type of that name is taken, and lookup stops there)"
---

## Rule

Inside a namespace body, the target of a using alias is looked up namespace by namespace, nearest first, and the first namespace that has a member of that name, a namespace as much as a type, decides. `namespace App; using M = Models;` beside a namespace `App.Models` and a global type `Models` makes `M` the namespace `App.Models`, and the global `Models` is never named. A nearer namespace has no key of its own, so each farther reading carries the nearer names of the target's first segment, and it binds nothing where the repository declares one of them as a namespace or a type: line 2 gives no edge to the global `Models`. Where nothing nearer has that name, the directive gives its edge whether or not the alias is used (`using O = Shop.Core.Order;` inside `namespace App.Web` gives the edge to `Shop.Core.Order`). A directive in the compilation unit reads from the global namespace, where nothing is nearer, and keeps its edge (the case csharp-using-alias-unused-type-edge). A use of the alias still reads every namespace of the directive's body, nearest first, because a namespace alias is used only as a qualifier, and `M.Order` binds `App.Models.Order` first.

## Files

```csharp path=src/c/Use.cs
namespace App;
using M = Models;
class C { M.Order o; }
```

```csharp path=src/w/Use.cs
namespace App.Web { using O = Shop.Core.Order; class D { } }
```

```csharp path=src/models/Order.cs
namespace App.Models;
public class Order { }
```

```csharp path=src/global/Models.cs
public class Models { }
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order { }
```

## Expect

- src/c/Use.cs:3 -> node:models     # `M.Order` is App.Models.Order; line 2 gives no edge to the global type Models (node global), which C# never names
- src/w/Use.cs:1 -> node:core       # no namespace or type App.Web.Shop or App.Shop: the unused alias O names the global Shop.Core.Order

## Why

The directive line read every enclosing namespace and then the global one, as a use of a type does, so an alias to a nearer namespace bound a global type of the same name, an edge to a type the code never names.
