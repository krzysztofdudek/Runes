---
id: csharp-public-and-internal-extension-method-one-file-internal-call-binds-other-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: only accessible methods are candidates, then overload resolution picks one); §7.5.2 (an internal member is accessible only within its assembly)"
---

## Rule

The same files, and a call with one argument: the method that takes it in Ext is the internal one, which a caller of another assembly that is no friend does not see, so the call binds Lib's public `Tag(this Order, string)`.

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
    o.Tag("k");
  }
}
```

## Expect

- src/Ext/A.cs:3 -> node:Lib      # `Order` in the public method's parameter list
- src/Ext/A.cs:4 -> node:Lib      # `Order` in the internal method's parameter list
- src/Web/Page.cs:3 -> node:Lib      # `Order`
- src/Web/Page.cs:4 -> node:Lib      # Ext's internal `Tag` is out of reach for Web

## Why

A file that holds a public and an internal method of one name must stay a definer through its public method only: the internal method has to stay out of reach, or the call would bind a method the compiler cannot see.
