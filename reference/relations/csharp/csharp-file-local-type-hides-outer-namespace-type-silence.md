---
id: csharp-file-local-type-hides-outer-namespace-type-silence
language: csharp
category: trap
expectation: silence
cites: "C# 11 file-local types proposal, Lookup (a file-local type found at a namespace level removes the non-file-local types of that level); C# spec §7.8.1 (a name binds at the nearest namespace that holds a type of that name, before any farther namespace)"
---

## Rule

A file-local type is a member of the namespace that declares it, so a reference in that namespace or in one inside it binds the file-local type and goes no farther. With `file class Helper` in `App.Inner`, the name `Helper` inside `App.Inner` never reaches the public `App.Helper` of the enclosing namespace.

## Files

```csharp path=src/web/Use.cs
namespace App {
  namespace Inner {
    file class Helper { }
    class C {
      Helper h;
    }
  }
}
```

```csharp path=src/util/Helper.cs
namespace App;
public class Helper { }
```

## Expect

- silence      # `Helper` on line 5 is App.Inner's file-local type; the App.Helper of node util lies farther out

## Why

The file-local type was not a candidate anywhere, so the lookup went on to the enclosing namespace and bound its public type of the same name.
