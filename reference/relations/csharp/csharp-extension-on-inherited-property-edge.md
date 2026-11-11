---
id: csharp-extension-on-inherited-property-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocation on any expression whose value is an instance); §12.8.4"
---

## Rule

`Services` is a property `WebModule` inherits from `ModuleBase` of node core, so `Services.AddBilling()` is a call on a value and binds the extension method of node billing.

## Files

```csharp path=src/core/ModuleBase.cs
namespace App.Core;
public class ServiceSet { }
public abstract class ModuleBase { protected ServiceSet Services { get; } = new(); }
```

```csharp path=src/billing/BillingExtensions.cs
namespace App.Core;
public static class BillingExtensions { public static void AddBilling(this ServiceSet s) { } }
```

```csharp path=src/web/WebModule.cs
using App.Core;
namespace App.Web;
public class WebModule : ModuleBase {
  public void Configure() { Services.AddBilling(); }
}
```

## Expect

- src/billing/BillingExtensions.cs:2 -> node:core
- src/web/WebModule.cs:3 -> node:core
- src/web/WebModule.cs:4 -> node:billing   # the extension method

## Why

The receiver is no type: the name is a member the class inherits.
