---
id: csharp-pattern-constant-led-by-same-named-lambda-parameter-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.7.2 (identical simple names and type names); MS Learn — patterns (a constant pattern), lambda expressions"
---

## Rule

Inside `Status => x is Status.Active`, where the lambda's parameter takes its type from a method outside the repository, the pattern names the constant `Active` of the type `Status`: a constant pattern can only name a constant, and a parameter of that name does not hide the type there. The pattern gives the edge alone and in a chain of tests, and it is the file's only reference to `Status`.

## Files

```csharp path=src/model/Status.cs
namespace App.Model;
public enum Status { Active, Done }
```

```csharp path=src/web/Check.cs
using App.Model;
namespace App.Web;
public class Check {
  public bool A(object x) => Sdk.Items.Any(Status => x is Status.Active);
  public bool B(object x) => Sdk.Items.Any(Status => x is Status.Active || x is Status.Done);
}
```

## Expect

- src/web/Check.cs:4 -> node:model      # the constant of the type, inside a lambda whose parameter has its name
- src/web/Check.cs:5 -> node:model      # the same in a chain of tests

## Why

The first name of a dotted constant was read as no type wherever the file declares a value of that name, a lambda's parameter included, so the file had no edge to `Status`.
