---
id: csharp-public-and-internal-extension-method-one-file-public-call-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: only accessible methods are candidates, then overload resolution picks one); §7.5.2 (an internal member is accessible only within its assembly)"
---

## Rule

Ext declares a public `Tag(this Order o)` and an internal `Tag(this Order o, string k)` in one static class, and does not name Web a friend. Web references Ext and Lib, and Lib declares a public `Tag(this Order, string)`. The call `o.Tag()` takes no argument: the only method that takes it is Ext's public one, which Web sees, so it binds Ext, though the file also holds an internal method of the name.

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
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Ext/A.cs
namespace App.Web;
public static class A {
  public static void Tag(this Order o) { }
  internal static void Tag(this Order o, string k) { }
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
    o.Tag();
  }
}
```

## Expect

- src/Ext/A.cs:3 -> node:Lib      # `Order` in the public method's parameter list
- src/Ext/A.cs:4 -> node:Lib      # `Order` in the internal method's parameter list
- src/Web/Page.cs:3 -> node:Lib      # `Order`
- src/Web/Page.cs:4 -> node:Ext      # the public `Tag` of `A`; Lib's takes one argument

## Why

The file was read as internal to its assembly because one of its methods of the name is, so Ext was dropped as a definer for a caller that is no friend, and the call that only its public method takes lost its edge (or, with a farther method of the name, was bound to that one).
