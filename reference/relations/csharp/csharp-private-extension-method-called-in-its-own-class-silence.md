---
id: csharp-private-extension-method-called-in-its-own-class-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §12.8.10.3 (extension method invocations: only accessible methods are candidates); §7.5.3 (a private member is accessible only within its type)"
---

## Rule

A call inside the static class that declares a private extension method sees it: it binds that method (the namespace of the class is nearer than the namespace of Lib's `Tag`), so no edge goes to Lib's method of the same shape.

## Files

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Lib/LibExt.cs
namespace App;
public static class LibExt {
  public static void Tag(this string s, string k) { }
}
```

```xml path=src/Ext/Ext.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Ext/B.cs
namespace App.Web;
public static class B {
  static void Tag(this string s, string k) { }
  public static void Run(string s) { s.Tag("k"); }
}
```

## Expect

- silence      # the call in `B` binds `B.Tag`, a method of its own file

## Why

Hiding a private method from every file but the one that declares it must keep it for the calls of its own class: a call in the class binds it, and Lib's method stays unbound.
