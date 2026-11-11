---
id: csharp-attribute-suffixed-nearer-than-written-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §23.3 (attribute specification: of the readings `Name` and `NameAttribute`, the one that is an attribute class is the result; both being attribute classes is an error)"
---

## Rule

`[Audit]` inside `App.Web`: the suffixed reading binds `App.Web.AuditAttribute` of node attrs, an attribute class through its own base `MarkAttribute`; the written reading binds the plain class `Lib.Audit` of node lib through a using. Each reading is looked up by itself, and the attribute class is the result.

## Files

```csharp path=src/attrs/AuditAttribute.cs
namespace App.Web;
public class AuditAttribute : MarkAttribute { }
public class MarkAttribute : System.Attribute { }
```

```csharp path=src/lib/Audit.cs
namespace Lib;
public class Audit { }
```

```csharp path=src/web/Controller.cs
using Lib;
namespace App.Web;
public class Controller {
  [Audit] public void Get() { }
}
```

## Expect

- src/web/Controller.cs:4 -> node:attrs

## Why

The base chain is followed through the repository until it reaches `System.Attribute`.
