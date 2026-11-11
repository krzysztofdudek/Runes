---
id: csharp-extension-unreferenced-sibling-method-not-counted-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: the candidates are the extension methods of the compilation and of the assemblies it references, and the lookup goes on outward when none of them is applicable)"
---

## Rule

An extension method of a project the caller does not reference is no candidate for its call. Two projects of one owner declare `Tag` in `App.Web`: One's takes no argument, Two's takes one. Web references One alone, whose method cannot take `o.Tag("k")`, so the lookup goes on to the namespace `App`, where Lib's `Tag(this Order, string)` takes the call.

## Files

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Core/Order.cs
namespace App;
public class Order { }
```

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Lib/LibExt.cs
namespace App;
public static class LibExt { public static void Tag(this Order o, string k) { } }
```

```xml path=src/Ext/One/One.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\..\Core\Core.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Ext/One/A.cs owner=Ext
namespace App.Web;
public static class A { public static void Tag(this Order o) { } }
```

```xml path=src/Ext/Two/Two.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\..\Core\Core.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Ext/Two/B.cs owner=Ext
namespace App.Web;
public static class B { public static void Tag(this Order o, string k) { } }
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
    <ProjectReference Include="..\Ext\One\One.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Page.cs
namespace App.Web;
public class Page {
  void M(Order o) {
    o.Tag("k");
  }
}
```

## Expect

- src/Web/Page.cs:3 -> node:Core
- src/Web/Page.cs:4 -> node:Lib      # project Two, whose Tag takes the argument, is not referenced
- src/Lib/LibExt.cs:2 -> node:Core
- src/Ext/One/A.cs:2 -> node:Core
- src/Ext/Two/B.cs:2 -> node:Core

## Why

The check of the call's counts read the shapes of every file of the bound owner, a file of the unreferenced project among them, so the owner took the call through a method the caller's project cannot see and Lib lost its edge.
