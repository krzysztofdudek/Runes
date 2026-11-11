---
id: csharp-extension-internal-sibling-method-not-counted-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.5.2 (an internal type is accessible only within its own assembly); §12.8.10.3 (extension method invocations: the candidates are the accessible extension methods of a namespace, and the lookup goes on outward when none of them is applicable)"
---

## Rule

An extension method the caller cannot access is no candidate for its call, so it cannot hold the lookup at its namespace. In `App.Web`, project Ext declares a public `Tag(this Order)` and, in an internal class, `Tag(this Order, string)`. Web sees only the first, which cannot take `o.Tag("k")`, so the lookup goes on to the namespace `App`, where Lib's public `Tag(this Order, string)` takes the call.

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

```xml path=src/Ext/Ext.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Ext/A.cs
namespace App.Web;
public static class A { public static void Tag(this Order o) { } }
```

```csharp path=src/Ext/B.cs
namespace App.Web;
internal static class B { public static void Tag(this Order o, string k) { } }
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
    <ProjectReference Include="..\Ext\Ext.csproj" />
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
- src/Web/Page.cs:4 -> node:Lib      # Ext's Tag of one parameter is internal to Ext
- src/Lib/LibExt.cs:2 -> node:Core
- src/Ext/A.cs:2 -> node:Core
- src/Ext/B.cs:2 -> node:Core

## Why

The check of the call's counts read the shapes of every extension method the nearer owner declares under the name, the internal one among them, so the nearer owner took the call through a method the compiler cannot see and Lib lost its edge.
