---
id: csharp-file-local-type-hides-using-imported-type-silence
language: csharp
category: trap
expectation: silence
cites: "C# 11 file-local types proposal, Lookup and remarks (a file-local type shadows a non-file-local type); C# spec §7.8.1 (the members of a namespace are read before the using directives of its declaration)"
---

## Rule

A file-local type of the namespace is read before the types the file's using directives import. With `using Lib;` and a `file class Order` in the namespace `App`, the name `Order` in that file names the file-local type, never `Lib.Order`.

## Files

```csharp path=src/web/Use.cs
using Lib;
namespace App;
file class Order { }
class C {
  Order o;
}
```

```csharp path=src/lib/Order.cs
namespace Lib;
public class Order { }
```

## Expect

- silence      # `Order` on line 5 is the file-local type of App; the Lib.Order of node lib is imported by a using, which is read after it

## Why

The import was the first reading that bound, because the file-local type that hides it was not a candidate.
