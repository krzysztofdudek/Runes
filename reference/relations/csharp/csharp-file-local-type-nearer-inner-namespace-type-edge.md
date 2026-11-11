---
id: csharp-file-local-type-nearer-inner-namespace-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# 11 file-local types proposal, Lookup (the file-local type shadows within the lookup level it is found at); C# spec §7.8.1 (the namespaces around a reference are read nearest first)"
---

## Rule

A file-local type of the outer namespace `App` shadows the types of `App`, not those of the inner namespace `App.Inner` that the reference stands in: that namespace is read first. A public `App.Inner.Helper` of another file still binds.

## Files

```csharp path=src/web/Use.cs
namespace App {
  file class Helper { }
  namespace Inner {
    class C {
      Helper h;
    }
  }
}
```

```csharp path=src/inner/Helper.cs
namespace App.Inner;
public class Helper { }
```

## Expect

- src/web/Use.cs:5 -> node:inner      # App.Inner.Helper is nearer than the file-local App.Helper

## Why

The file-local type must hide only the levels at and beyond its own.
