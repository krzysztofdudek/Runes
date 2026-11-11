---
id: csharp-attribute-written-outside-base-silence
language: csharp
category: usage-site
expectation: silence
cites: "C# spec §23.3 (attribute specification: of the readings `Name` and `NameAttribute`, the one that is an attribute class is the result; both being attribute classes is an error)"
---

## Rule

`[Route]` with the entity `Route : EntityBase` of node domain, whose base is a library's, and no `RouteAttribute` in the repository. The written name has no suffix and its class only may be an attribute class, so the attribute is read as the framework's `RouteAttribute`: no edge.

## Files

```csharp path=src/domain/Route.cs
using Vendor.Persistence;
namespace App.Domain;
public class Route : EntityBase { }
```

```csharp path=src/web/RoutesController.cs
using App.Domain;
using Microsoft.AspNetCore.Mvc;
namespace App.Web;
public class RoutesController {
  [Route("api/routes")] public void Get() { }
}
```

## Expect

- silence

## Why

A false edge to a domain class costs more here than a missed one to an attribute class named without the suffix.
