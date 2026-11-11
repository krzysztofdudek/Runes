---
id: csharp-partial-part-property-receiver-silence
language: csharp
category: usage-site
expectation: silence
cites: "C# spec §12.8.4 (simple names: the members of the enclosing type, inherited ones included and from every part of a partial type, are read before any namespace member); §15.2.7 (partial types)"
---

## Rule

One part of `partial class OrderService` declares the private property `Cache`; the other part, in another file, calls `Cache.Get(1)`. That reads the property, not the static class `App.Cache` of node legacy.

## Files

```csharp path=src/web/OrderService.cs
namespace App.Web;
public partial class OrderService { private CacheClient Cache { get; } = new(); }
public class CacheClient { public int Get(int k) => k; }
```

```csharp path=src/web/OrderService.Get.cs
namespace App.Web;
public partial class OrderService {
  public int M() => Cache.Get(1);
}
```

```csharp path=src/legacy/Cache.cs
namespace App;
public static class Cache { public static int Get(int k) => k; }
```

## Expect

- silence

## Why

A private member is seen by every part of its own type.
