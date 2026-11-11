---
id: csharp-file-local-type-other-file-hides-nothing-edge
language: csharp
category: trap
expectation: edge
cites: "C# 11 file-local types proposal (a file-local type is accessible only in the file that declares it)"
---

## Rule

A file-local type hides nothing in the other files. A reference to `Helper` in a file that does not declare it binds the public `App.Helper`, whatever other files declare `file class Helper` in the same namespace.

## Files

```csharp path=src/web/Use.cs
namespace App;
file class Helper { }
class C { }
```

```csharp path=src/c/Other.cs
namespace App;
class D {
  Helper h;
}
```

```csharp path=src/util/Helper.cs
namespace App;
public class Helper { }
```

## Expect

- src/c/Other.cs:3 -> node:util      # the file-local Helper of Use.cs is invisible here

## Why

Guards the shadowing from leaking: it must be a property of the declaring file alone.
