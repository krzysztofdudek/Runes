---
id: csharp-file-local-type-alias-qualified-attribute-silence
language: csharp
category: trap
expectation: silence
cites: "C# 11 file-local types proposal, Lookup and remarks; C# spec §22.3 (attribute names: `[X]` names `X` or `XAttribute`); §14.8 (the alias qualifier)"
---

## Rule

An attribute written after a using alias, `[S::Marker]`, is looked up in both readings (`Marker` and `MarkerAttribute`) among the members of the aliased namespace. A file-local `MarkerAttribute` of that namespace is found there and removes the public one of another file, so the attribute is no dependency on that file.

## Files

```csharp path=src/web/Use.cs
using S = App;
namespace App;
file class MarkerAttribute : System.Attribute { }
[S::Marker]
class C { }
```

```csharp path=src/util/Marker.cs
namespace App;
public class MarkerAttribute : System.Attribute { }
```

## Expect

- silence      # `[S::Marker]` on line 4 names the file-local MarkerAttribute, not the App.MarkerAttribute of node util

## Why

The attribute form of the alias-qualified path had the same gap as the type form.
