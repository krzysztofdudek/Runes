---
id: csharp-attribute-plain-class-of-that-name-silence
language: csharp
category: usage-site
expectation: silence
cites: "C# spec §23.3 (attribute specification: of the readings `Name` and `NameAttribute`, the one that is an attribute class is the result; both being attribute classes is an error)"
---

## Rule

A logistics domain declares the class `Route`; a controller imports the domain and uses ASP.NET's `[Route]`, which is the framework's `RouteAttribute`. The repository's `Route` derives from nothing, so it is no attribute class and the attribute gives no edge.

## Files

```csharp path=src/domain/Route.cs
namespace App.Domain;
public class Route { }
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

The whole base chain of `Route` lies in the repository and never reaches `System.Attribute`.
