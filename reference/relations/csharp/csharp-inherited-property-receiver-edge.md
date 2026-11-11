---
id: csharp-inherited-property-receiver-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.4 (simple names: the members of the enclosing type, inherited ones included and from every part of a partial type, are read before any namespace member); §12.8.7 (member access)"
---

## Rule

`Settings.Get("x")` in `OrdersController`, which derives from `ApiBase`, which derives from `ServiceBase`: `Settings` is the protected property `ServiceBase` declares, two bases up, not the static class `App.Settings` of node legacy. Line 4 gives no edge; the base class on line 3 keeps its own.

## Files

```csharp path=src/core/ApiBase.cs
namespace App.Core;
public class AppSettings { public string Get(string k) => k; }
public abstract class ServiceBase { protected AppSettings Settings { get; } = new(); }
public abstract class ApiBase : ServiceBase { }
```

```csharp path=src/legacy/Settings.cs
namespace App;
public static class Settings { public static string Get(string k) => k; }
```

```csharp path=src/web/OrdersController.cs
using App.Core;
namespace App.Web;
public class OrdersController : ApiBase {
  public string M() => Settings.Get("x");
}
```

## Expect

- src/web/OrdersController.cs:3 -> node:core      # the base class; line 4 reads an inherited property

## Why

An inherited member is a member of the class, through as many base classes as the repository declares.
