---
id: csharp-private-extension-method-beside-public-other-count-binds-other-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: only accessible methods are candidates); §7.5.3 (a private member is accessible only within its type)"
---

## Rule

A static class declares a public `Tag(this Order o)` and a private `Tag(this Order o, string k)`. A call with one argument from another assembly that is a friend takes neither of the class's visible methods (the public one takes no argument, the private one is not seen), so it binds Lib's `Tag(this Order, string)`.

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
  public static void Tag(this Order o) { }
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

- src/Ext/B.cs:3 -> node:Lib      # `Order` in the public method's parameter list
- src/Ext/B.cs:4 -> node:Lib      # `Order` in the private method's parameter list
- src/Web/Page.cs:3 -> node:Lib      # `Order`
- src/Web/Page.cs:4 -> node:Lib      # only Lib's `Tag` takes one argument and is seen

## Why

The private method's count was taken for a visible one, so the count check let the call bind Ext, where the compiler binds Lib.
