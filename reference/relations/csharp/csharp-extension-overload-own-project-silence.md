---
id: csharp-extension-overload-own-project-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §12.8.10.3 (extension method invocations: the candidates are all extension methods in scope, then overload resolution picks one)"
---

## Rule

The preference of a project's own declaration over a referenced one (warning CS0436) belongs to types of one name. Two extension methods named `Shout` in two imported namespaces are overloads: the compiler picks by the receiver, not by the project. `s.Shout()` on a `string` binds `R.Ext.Shout(this string)` in the referenced project R, not `P.Ext.Shout(this int)` in the caller's own project, so no edge to the own project's declaration is drawn; with two declarations in reach the lookup stays ambiguous and gives none.

## Files

```xml path=src/P/P.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\R\R.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/P/a/X.cs
using P.Ext;
using R.Ext;
namespace P.A;
public class X {
  public void Run(string s) { s.Shout(); }
}
```

```csharp path=src/P/b/Y.cs
namespace P.Ext;
public static class IntExt {
  public static void Shout(this int i) { }
}
```

```xml path=src/R/R.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/R/StringExt.cs
namespace R.Ext;
public static class StringExt {
  public static void Shout(this string s) { }
}
```

## Expect

- silence      # two in-scope Shout overloads in reach: no preference for the own project

## Why

Giving the own project the preference for extension methods turned the ambiguity into a false edge to the overload the call does not bind.
