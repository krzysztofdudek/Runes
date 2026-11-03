---
id: csharp-extension-using-sibling-block-silence
language: csharp
category: nested
expectation: silence
cites: "C# spec §14.5.1 (the scope of a using directive is the body that contains it); §12.8.10.3 (extension method invocations: the candidates come from the enclosing namespace declarations and the using namespace directives of each)"
---

## Rule

A plain using directive inside a namespace block imports the extension methods of its namespace into that block only. A call in a sibling block of the same file does not see them, so `s.Shout()` there does not bind an extension method that only the first block's using brings into scope.

## Files

```csharp path=src/a/Use.cs
namespace App.First
{
    using Shop.Ext;
    class A { }
}
namespace App.Second
{
    class B { void M(string s) { s.Shout(); } }
}
```

```csharp path=src/ext/Strings.cs
namespace Shop.Ext;
public static class Strings { public static void Shout(this string s) { } }
```

## Expect

- silence      # the extension method Shout of Shop.Ext is in scope in block App.First only

## Why

The namespaces of plain using directives were read file-wide for extension methods too, so a call in one block bound an extension method only a sibling block imports.
