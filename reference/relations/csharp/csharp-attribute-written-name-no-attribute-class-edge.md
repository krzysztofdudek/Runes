---
id: csharp-attribute-written-name-no-attribute-class-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §23.3 (attribute specification: of the readings `Name` and `NameAttribute`, the one that is an attribute class is the result; both being attribute classes is an error)"
---

## Rule

`[Required]` with the entity `App.Domain.Required` of node domain and the attribute `App.Validation.RequiredAttribute` of node val both imported: only the suffixed reading is an attribute class, so the attribute is node val's.

## Files

```csharp path=src/domain/Required.cs
namespace App.Domain;
public class Required { }
```

```csharp path=src/val/RequiredAttribute.cs
namespace App.Validation;
public class RequiredAttribute : System.Attribute { }
```

```csharp path=src/web/Dto.cs
using App.Domain;
using App.Validation;
namespace App.Web;
public class Dto {
  [Required] public string Name { get; set; }
}
```

## Expect

- src/web/Dto.cs:5 -> node:val

## Why

A class that derives from nothing is no attribute class, whatever its name.
