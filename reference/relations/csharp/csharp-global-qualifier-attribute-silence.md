---
id: csharp-global-qualifier-attribute-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §7.8 (global:: alias-qualified name — the global namespace only); §22.3 (attribute names); Runes issue 174"
---

## Rule

When the global namespace declares no attribute of the name written after `global::`, nothing binds: `[global::Audit.Tracked]`, `[global::Cached]` and `[global::Retry<int>]` inside `namespace Shop.Web` stay silent although `Shop.Web` declares `Audit.TrackedAttribute`, `CachedAttribute` and `Retry<T>`, and `using Shop.Core;` imports another `CachedAttribute`.

## Files

```csharp path=src/web/Handler.cs
using Shop.Core;
namespace Shop.Web;
[global::Audit.Tracked]
[global::Cached]
[global::Retry<int>]
class Handler { }
```

```csharp path=src/decoy/Decoys.cs
namespace Shop.Web.Audit { public class TrackedAttribute : System.Attribute { } }
namespace Shop.Web { public class CachedAttribute : System.Attribute { } public class Retry<T> : System.Attribute { } }
```

```csharp path=src/core/Cached.cs
namespace Shop.Core;
public class CachedAttribute : System.Attribute { }
```

## Expect

- silence      # `global::` skips the enclosing namespace and the usings; the global namespace declares none of these attributes

## Why

`global::` on an attribute exists to step past a nearer declaration of the same name; binding the nearer one reports a dependency the code does not have.
