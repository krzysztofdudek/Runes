---
id: csharp-attribute-written-with-suffix-outside-base-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §23.3 (attribute specification: of the readings `Name` and `NameAttribute`, the one that is an attribute class is the result; both being attribute classes is an error)"
---

## Rule

`[RangeAttribute]` written in full, with `RangeAttribute : ValidationAttribute` of node val: a name that ends in `Attribute` has one reading, and a class whose base leaves the repository is taken for it.

## Files

```csharp path=src/val/RangeAttribute.cs
using System.ComponentModel.DataAnnotations;
namespace App.Validation;
public class RangeAttribute : ValidationAttribute { }
```

```csharp path=src/web/Dto.cs
using App.Validation;
namespace App.Web;
public class Dto {
  [RangeAttribute] public int Size { get; set; }
}
```

## Expect

- src/web/Dto.cs:4 -> node:val

## Why

There is no second reading the framework could supply.
