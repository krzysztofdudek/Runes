---
id: csharp-alias-qualified-dotted-attribute-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.8 (namespace alias qualifier `S::I` — `S` a using alias to a namespace, `I` looked up in that namespace only); §22.3 (attribute names: `[X]` names `X` or `XAttribute`)"
---

## Rule

An attribute whose name goes on past a using alias (`[S::Core.Mark]`, `[S::Core.Gen<Order>]`, `using S = Shop;`) names an attribute below the aliased namespace, `Shop.Core.Mark` or `Shop.Core.MarkAttribute`, read as a type's `S::Core.Order` is: in the namespace the alias names and nowhere else, so a same-named attribute of the enclosing namespace or of the global namespace is never it. A generic one is named by its plain dotted name, and each type argument is an ordinary type reference. The grammar puts `S::Core` at the deepest qualifier of the name, so the alias is read there. An extern alias (`[Lib::Core.Mark]`) binds nothing, as for a single name (the case csharp-alias-qualified-attribute-silence).

## Files

```csharp path=src/web/Handler.cs
using Shop.Data;
using S = Shop;
namespace Shop.Web;
[S::Core.Mark]
[S::Core.Gen<Order>]
class Handler { }
```

```csharp path=src/attrs/Attrs.cs
namespace Shop.Core;
public class MarkAttribute : System.Attribute { }
public class Gen<T> : System.Attribute { }
```

```csharp path=src/data/Order.cs
namespace Shop.Data;
public class Order { }
```

```csharp path=src/decoy/Decoys.cs
namespace Shop.Web.Core { public class MarkAttribute : System.Attribute { } public class Gen<T> : System.Attribute { } }
```

## Expect

- src/web/Handler.cs:4 -> node:attrs    # [S::Core.Mark] → Shop.Core.MarkAttribute, never Shop.Web.Core.MarkAttribute (node decoy)
- src/web/Handler.cs:5 -> node:attrs    # [S::Core.Gen<Order>] → Shop.Core.Gen<T>, never Shop.Web.Core.Gen<T> (node decoy)
- src/web/Handler.cs:5 -> node:data     # its type argument Order → Shop.Data.Order through the using

## Why

The alias was looked for only at the top of the attribute name, so `[S::Core.Mark]` gave the written text `S::Core.Mark` as its key, which no declaration has, and `[S::Core.Gen<Order>]` gave no attribute edge at all, while the comment at that code said it was rewritten onto the aliased namespace.
