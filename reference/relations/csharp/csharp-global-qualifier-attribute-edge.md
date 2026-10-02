---
id: csharp-global-qualifier-attribute-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.8 (global:: alias-qualified name — `global::A.B` and `global::I` look up from the global namespace only); §22.3 (attribute names: `[X]` names `X` or `XAttribute`); Runes issue 174"
---

## Rule

An attribute name written after `global::` is looked up from the global namespace only, as a type name is: `[global::Audit.Tracked]` binds `Audit.TrackedAttribute` and `[global::Cached]` binds the global `CachedAttribute`, never a same-named attribute of the enclosing namespace `Shop.Web`, and `[global::Retry<Order>]` binds the global generic attribute `Retry<T>`, its type argument read as an ordinary name. The `Attribute`-suffix convention holds for both readings.

## Files

```csharp path=src/web/Handler.cs
using Shop.Core;
namespace Shop.Web;
[global::Audit.Tracked]
[global::Cached]
[global::Retry<Order>]
class Handler { }
```

```csharp path=src/audit/Tracked.cs
namespace Audit;
public class TrackedAttribute : System.Attribute { }
```

```csharp path=src/cache/Cached.cs
public class CachedAttribute : System.Attribute { }
public class Retry<T> : System.Attribute { }
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order { }
```

```csharp path=src/decoy/Decoys.cs
namespace Shop.Web.Audit { public class TrackedAttribute : System.Attribute { } }
namespace Shop.Web { public class CachedAttribute : System.Attribute { } public class Retry<T> : System.Attribute { } }
```

## Expect

- src/web/Handler.cs:3 -> node:audit    # [global::Audit.Tracked] → Audit.TrackedAttribute, never Shop.Web.Audit.TrackedAttribute (node:decoy)
- src/web/Handler.cs:4 -> node:cache    # [global::Cached] → the global CachedAttribute, never Shop.Web.CachedAttribute (node:decoy)
- src/web/Handler.cs:5 -> node:cache    # [global::Retry<Order>] → the global Retry<T>, never Shop.Web.Retry<T> (node:decoy)
- src/web/Handler.cs:5 -> node:core     # its type argument Order → Shop.Core.Order through the using

## Why

An attribute is a dependency like any other type use; reading `global::` there through the enclosing namespaces reports the very type the author stepped past, and dropping the single-name form loses the real dependency.
