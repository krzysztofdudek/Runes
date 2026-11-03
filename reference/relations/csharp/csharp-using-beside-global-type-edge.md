---
id: csharp-using-beside-global-type-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.8.1 (namespace and type names: at each namespace, nearest first and the global namespace last, a member type of that name is taken before the using directives of the declaration of that namespace, and for the global namespace that declaration is the compilation unit); §14.5.3 (using namespace directives: a type of the namespace or compilation unit that holds the directive hides an imported type of the same name)"
---

## Rule

At each namespace of the lookup C# reads that namespace's own members before the using directives of its declaration, and the compilation unit is the declaration of the global namespace. So with `using Lib;` at the top of a file and a type `Order` declared in the global namespace, `Order` names the global type, never `Lib.Order`, both in the compilation unit and inside a namespace body (where the body's own namespaces are read first and the global namespace, with the compilation unit's usings after it, last). Where no global `Order` exists, the using imports `Lib.Order` (the case csharp-plain-using-simple-name).

## Files

```csharp path=src/c/Use.cs
using Lib;
class C { Order o; }
namespace App
{
    class D { Order o; }
}
```

```csharp path=src/lib/Order.cs
namespace Lib;
public class Order { }
```

```csharp path=src/global/Order.cs
public class Order { }
```

## Expect

- src/c/Use.cs:2 -> node:global     # the global namespace's own Order comes before the compilation unit's `using Lib;`; never Lib.Order (node lib)
- src/c/Use.cs:5 -> node:global     # no App.Order: the global namespace is read next, still before the compilation unit's usings

## Why

The types the compilation unit's usings import were read before the global namespace, so a use of a name both declare bound the imported type: a false edge to it and a lost edge to the global type.
