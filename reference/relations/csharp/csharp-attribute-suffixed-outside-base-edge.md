---
id: csharp-attribute-suffixed-outside-base-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §23.3 (attribute specification: of the readings `Name` and `NameAttribute`, the one that is an attribute class is the result; both being attribute classes is an error)"
---

## Rule

`[RequiredIf]` with `RequiredIfAttribute : ValidationAttribute` of node val, whose base is the framework's: the chain leaves the repository, so the class may be an attribute class. As the suffixed reading it is taken, because the written reading binds only the plain class `App.Domain.RequiredIf` of node domain.

## Files

```csharp path=src/domain/RequiredIf.cs
namespace App.Domain;
public class RequiredIf { }
```

```csharp path=src/val/RequiredIfAttribute.cs
using System.ComponentModel.DataAnnotations;
namespace App.Validation;
public class RequiredIfAttribute : ValidationAttribute { }
```

```csharp path=src/web/Dto.cs
using App.Domain;
using App.Validation;
namespace App.Web;
public class Dto {
  [RequiredIf] public string Name { get; set; }
}
```

## Expect

- src/web/Dto.cs:5 -> node:val

## Why

A class named with the suffix and derived from a framework type is what the convention calls an attribute class.
