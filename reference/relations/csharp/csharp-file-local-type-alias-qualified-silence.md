---
id: csharp-file-local-type-alias-qualified-silence
language: csharp
category: trap
expectation: silence
cites: "C# 11 file-local types proposal, Lookup and remarks; C# spec §14.8 (a namespace alias qualifier `S::I` looks `I` up in the namespace `S` names)"
---

## Rule

`S::Helper` under `using S = App;` looks `Helper` up among the members of the namespace `App`, where this file's file-local `Helper` is found and the public `App.Helper` of another file is removed. The reference binds the file-local type and is no dependency on the other file.

## Files

```csharp path=src/web/Use.cs
using S = App;
namespace App;
file class Helper { }
class C {
  S::Helper a;
}
```

```csharp path=src/util/Helper.cs
namespace App;
public class Helper { }
```

## Expect

- silence      # `S::Helper` on line 5 is the file-local type of App, not the App.Helper of node util

## Why

The alias-qualified path read the aliased namespace's member without asking whether it is a file-local type of this file, a false edge.
