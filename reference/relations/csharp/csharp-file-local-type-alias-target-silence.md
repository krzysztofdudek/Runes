---
id: csharp-file-local-type-alias-target-silence
language: csharp
category: trap
expectation: silence
cites: "C# 11 file-local types proposal, Lookup and remarks (a file-local type shadows a non-file-local type of the same name at its lookup level); C# spec §14.5.2 (a using alias target is a namespace or type name looked up like any other name)"
---

## Rule

The target of a using alias is looked up in the namespace body that holds it, and the file-local type of that namespace is found there before any public type of the same name. In `using H = Helper;` below `namespace App;` the name `Helper` is the file-local type, so neither the directive nor a use of `H` is a dependency on the public `App.Helper` of another file.

## Files

```csharp path=src/web/Use.cs
namespace App;
using H = Helper;
file class Helper { }
class C {
  H a;
}
```

```csharp path=src/util/Helper.cs
namespace App;
public class Helper { }
```

## Expect

- silence      # the alias target on line 2 and the use of `H` on line 5 both name the file-local Helper, not the App.Helper of node util

## Why

The directive's target path never asked whether a reading names a file-local type, so the directive gave an edge to the public type while the use of the alias, which asked, stayed silent.
