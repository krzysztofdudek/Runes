---
id: csharp-alias-qualified-attribute-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.8 (namespace alias qualifier `S::I` — `S` a using alias to a namespace, `I` looked up in that namespace only), §22.3 (attribute names: `[X]` names `X` or `XAttribute`); Runes issue 181"
---

## Rule

An attribute written after a using alias (`[A::Audited]`, `[A::Cache<Order>]`, `using A = Shop.Attrs;`) names an attribute of the aliased namespace, in both readings (`Audited` and `AuditedAttribute`), looked up there only, as a type's `A::Tail` is: a same-named attribute of the enclosing namespace is never it. A generic one's type arguments are ordinary type references.

## Files

```csharp path=src/web/Handler.cs
using Shop.Core;
using A = Shop.Attrs;
namespace Shop.Web;
[A::Audited]
[A::Cache<Order>]
class Handler { }
```

```csharp path=src/attrs/Attrs.cs
namespace Shop.Attrs;
public class AuditedAttribute : System.Attribute { }
public class Cache<T> : System.Attribute { }
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order { }
```

```csharp path=src/decoy/Decoys.cs
namespace Shop.Web { public class AuditedAttribute : System.Attribute { } public class Cache<T> : System.Attribute { } }
```

## Expect

- src/web/Handler.cs:4 -> node:attrs    # [A::Audited] → Shop.Attrs.AuditedAttribute, never Shop.Web.AuditedAttribute (node:decoy)
- src/web/Handler.cs:5 -> node:attrs    # [A::Cache<Order>] → Shop.Attrs.Cache<T>, never Shop.Web.Cache<T> (node:decoy)
- src/web/Handler.cs:5 -> node:core     # its type argument Order → Shop.Core.Order through the using

## Why

The alias-qualified attribute name was read as neither a plain name nor a `global::` one, so it gave no edge at all.
