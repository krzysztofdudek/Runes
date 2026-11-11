---
id: csharp-file-local-type-using-static-target-silence
language: csharp
category: trap
expectation: silence
cites: "C# 11 file-local types proposal, Lookup and remarks; C# spec §14.5.4 (the type a using static directive names is looked up as a using alias target is)"
---

## Rule

The type a `using static` directive names is looked up where the directive stands, nearest namespace first, and a file-local type of that namespace is found before a public type of the same name. `using static Helper;` below `namespace App;` names the file-local `Helper`, so it is no dependency on the public `App.Helper` of another file.

## Files

```csharp path=src/web/Use.cs
namespace App;
using static Helper;
file static class Helper { }
class C { }
```

```csharp path=src/util/Helper.cs
namespace App;
public static class Helper { }
```

## Expect

- silence      # line 2 names the file-local Helper, not the App.Helper of node util

## Why

The target of a using static went through the path that never asked whether a reading names a file-local type.
