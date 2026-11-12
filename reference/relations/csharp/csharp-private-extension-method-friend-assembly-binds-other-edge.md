---
id: csharp-private-extension-method-friend-assembly-binds-other-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: only accessible methods are candidates); §7.5.3 (a private member is accessible only within its type)"
---

## Rule

Ext declares `static void Tag(this Order o, string k)` in a static class `B`: with no access modifier it is private to `B`. Ext grants Web its internals, but a private method is no member of the assembly's internal view, so `o.Tag("k")` in Web does not see it and binds Lib's public `Tag` of the same shape.

## Files

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Lib/Lib.cs
namespace App;
public class Order { }
public static class LibExt {
  public static void Tag(this Order o, string k) { }
}
```

```xml path=src/Ext/Ext.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <InternalsVisibleTo Include="Web" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Ext/B.cs
namespace App.Web;
public static class B {
  static void Tag(this Order o, string k) { }
}
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Ext\Ext.csproj" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Page.cs
namespace App.Web;
public class Page {
  public void Run(Order o) {
    o.Tag("k");
  }
}
```

## Expect

- src/Ext/B.cs:3 -> node:Lib      # `Order` in the parameter list
- src/Web/Page.cs:3 -> node:Lib      # `Order`
- src/Web/Page.cs:4 -> node:Lib      # Ext's `Tag` is private to `B`; Lib's is the one the call binds

## Why

A private extension method was read as one its whole assembly sees, so a friend assembly counted it as a definer and drew an edge to a method the compiler cannot bind.
