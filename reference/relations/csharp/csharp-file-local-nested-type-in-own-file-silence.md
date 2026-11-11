---
id: csharp-file-local-nested-type-in-own-file-silence
language: csharp
category: nested
expectation: silence
cites: "C# spec §7.6.1 and §12.8.4 (the nested types of the enclosing types are read before any namespace member); C# 11 file-local types proposal (a type nested in a file-local type is accessible in that file)"
---

## Rule

A type nested in a `file` type is declared by that file and never leaves it, but inside the body of the file-local type it is still a nested type of an enclosing type and is read first. The name `Inner` there binds the nested type, never a same-named public type of the namespace in another file.

## Files

```csharp path=src/web/Use.cs
namespace App;
file class Outer {
  class Inner { }
  Inner i;
}
```

```csharp path=src/util/Inner.cs
namespace App;
public class Inner { }
```

## Expect

- silence      # `Inner` on line 4 is Outer+Inner of the file-local Outer, not the App.Inner of node util

## Why

A nested type of a file-local type was not published, so a use of it in its own file fell through to the namespace and bound a same-named public type, a false edge.
