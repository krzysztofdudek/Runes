---
id: csharp-alias-target-outer-block-using-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.2 (using alias directives: the target is resolved as if the namespace body that holds the directive had no using directives, while those of an enclosing namespace body still take part); §7.8.1 (namespace and type names: at each enclosing namespace, its members, then the using aliases and the using namespace directives of that namespace's declaration)"
---

## Rule

A using alias target is looked up from the namespace body that holds the directive outward. At each enclosing namespace C# reads that namespace's members, and then, when the reference sits inside a declaration of that namespace, the using directives of that declaration: an alias of that name first, then the types of the imported namespaces as one set (two of them declaring the name is an ambiguity). Only the directives of the body that holds the alias take no part. So in `namespace A { using Shop.Core; namespace B { using O = Order; } }` the target of `O` is `A.B.Order`, then `A.Order`, then `Shop.Core.Order` through the using of block `A`, and only then the global `Order`. A use of `O`, the type arguments of an alias target and a `using static` type are read that way. When an outer declaration holds an alias named like the target's first name (`namespace A { using X = Shop.Core; namespace B { using P = X.Order; } }`), that alias decides at its level; it is not read, and nothing farther is either, a deliberate silence. The using directives of the compilation unit, which C# reads after the global namespace, are not read (a silence, never a false edge). The directive line of a plain alias target inside a namespace body reads only its nearest reading (the case csharp-alias-namespace-beside-global-type-edge).

## Files

```csharp path=src/c/Use.cs
namespace A
{
    using Shop.Core;
    namespace B
    {
        using O = Order;
        using R = Repo<Order>;
        class C { O x; }
    }
}
```

```csharp path=src/d/Use.cs
namespace A
{
    using X = Shop.Core;
    namespace B
    {
        using P = X.Order;
        class D { P p; }
    }
}
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order { }
```

```csharp path=src/global/Order.cs
public class Order { }
```

```csharp path=src/r/Repo.cs
public class Repo<T> { }
```

```csharp path=src/x/Order.cs
namespace X;
public class Order { }
```

## Expect

- src/c/Use.cs:7 -> node:r          # the container Repo, the global one
- src/c/Use.cs:7 -> node:core       # its type argument Order is Shop.Core.Order through the using of block A, never the global Order (node global)
- src/c/Use.cs:8 -> node:core       # the use of O binds Shop.Core.Order the same way; line 6 gives no edge (nearest reading only)
                                    # src/d/Use.cs gives no edge: the alias X of block A decides `X.Order` and is not read, and the global X.Order (node x) is never it

## Why

The usings of an enclosing namespace block were never read for an alias target, so the lookup went on to the global namespace and could bind a global type of the same name where C# binds the one an outer using imports.
