---
id: csharp-pattern-constant-led-by-same-named-local-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.7.2 (identical simple names and type names); MS Learn — patterns (a constant pattern)"
---

## Rule

`var Status = Sdk.Factory.Make();` followed by `x is Status.Active` names the constant `Active` of the type `Status`: a constant pattern can only name a constant, and a local of that name, whose type the compiler infers, does not hide the type there. The pattern gives the edge alone and in a chain of tests, and it is the file's only reference to `Status`.

## Files

```csharp path=src/model/Status.cs
namespace App.Model;
public enum Status { Active, Done }
```

```csharp path=src/web/Check.cs
using App.Model;
namespace App.Web;
public class Check {
  public bool A(object x) { var Status = Sdk.Factory.Make(); return x is Status.Active; }
  public bool B(object x) { var Status = Sdk.Factory.Make(); return x is Status.Active || x is Status.Done; }
}
```

## Expect

- src/web/Check.cs:4 -> node:model      # the constant of the type, beside a local of its name
- src/web/Check.cs:5 -> node:model      # the same in a chain of tests

## Why

The first name of a dotted constant was read as no type wherever the file declares a value of that name, so a file whose only use of `Status` sits beside a `var` local of that name had no edge to it.
