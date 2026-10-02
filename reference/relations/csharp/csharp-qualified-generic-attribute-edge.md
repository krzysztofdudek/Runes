---
id: csharp-qualified-generic-attribute-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# 11 generic attributes; C# spec §22.3 (attribute names: `[X]` names `X` or `XAttribute`), §7.8 (`global::` looks up from the global namespace only); Runes issue 181"
---

## Rule

A generic attribute written behind a qualifier (`[Audit.Retry<Order>]`, `[Audit.Policies.Limit<Order, Item>]`) is named by its plain dotted name, the type-argument list stripped as a qualified type name's is, with the `Attribute`-suffix convention for both readings; each type argument is an ordinary type reference. After `global::` (`[global::Audit.Tracked<Item>]`) the name is looked up from the global namespace only, never in a same-named namespace inside the enclosing one.

## Files

```csharp path=src/web/Handler.cs
using Shop.Core;
namespace Shop.Web;
[Audit.Retry<Order>]
[Audit.Policies.Limit<Order, Item>]
class Handler { }
```

```csharp path=src/admin/Panel.cs
using Shop.Core;
namespace Shop.Admin;
[global::Audit.Tracked<Item>]
class Panel { }
```

```csharp path=src/audit/Attrs.cs
namespace Audit;
public class RetryAttribute<T> : System.Attribute { }
public class Tracked<T> : System.Attribute { }
```

```csharp path=src/policies/Limit.cs
namespace Audit.Policies;
public class LimitAttribute<T, U> : System.Attribute { }
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order { }
```

```csharp path=src/items/Item.cs
namespace Shop.Core;
public class Item { }
```

```csharp path=src/decoy/Decoys.cs
namespace Shop.Admin.Audit { public class Tracked<T> : System.Attribute { } }
```

## Expect

- src/web/Handler.cs:3 -> node:audit      # [Audit.Retry<Order>] → Audit.RetryAttribute<T> through the suffix convention
- src/web/Handler.cs:3 -> node:core       # its type argument Order → Shop.Core.Order through the using
- src/web/Handler.cs:4 -> node:policies   # [Audit.Policies.Limit<Order, Item>] → Audit.Policies.LimitAttribute<T, U>
- src/web/Handler.cs:4 -> node:core       # type argument Order
- src/web/Handler.cs:4 -> node:items      # type argument Item
- src/admin/Panel.cs:3 -> node:audit      # [global::Audit.Tracked<Item>] → the global Audit.Tracked<T>, never Shop.Admin.Audit.Tracked<T> (node:decoy)
- src/admin/Panel.cs:3 -> node:items      # its type argument Item

## Why

The qualified generic form kept its `<…>` in the name it looked up, so neither the attribute nor its type arguments gave an edge.
