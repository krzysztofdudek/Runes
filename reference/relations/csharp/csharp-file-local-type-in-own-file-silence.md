---
id: csharp-file-local-type-in-own-file-silence
language: csharp
category: trap
expectation: silence
cites: "C# 11 file-local types proposal, Lookup: if the set of accessible members contains file-local types, all members which are not file-local types are removed from the set; its remarks: these rules permit a file-local type to shadow a namespace or a non-file-local type"
---

## Rule

Inside the file that declares a `file` type, the name of that type binds the file-local type, which shadows a public type of the same name and namespace declared in another file. The file-local type belongs to no other file, so the reference gives no edge; it must never reach the public `App.Helper` of another node.

## Files

```csharp path=src/web/Use.cs
namespace App;
file class Helper { }
class C {
  Helper h;
}
```

```csharp path=src/util/Helper.cs
namespace App;
public class Helper { }
```

## Expect

- silence      # `Helper` on line 4 is the file-local type, not the public App.Helper of node util

## Why

A file-local type is not published, so inside its own file the name fell through to the public type of the same name in another file, a false edge.
