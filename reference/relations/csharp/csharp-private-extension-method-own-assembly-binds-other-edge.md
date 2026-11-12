---
id: csharp-private-extension-method-own-assembly-binds-other-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.10.3 (extension method invocations: only accessible methods are candidates); §7.5.3 (a private member is accessible only within its type)"
---

## Rule

A private extension method is seen inside its own static class only. A call in another class of the same project does not see it, so it binds the public `Tag` of the farther namespace in Lib.

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

```csharp path=src/Ext/B.cs
namespace App.Web;
public static class B {
  static void Tag(this Order o, string k) { }
}
```

```csharp path=src/Ext/Use.cs
namespace App.Web;
public class Use {
  public void Run(Order o) {
    o.Tag("k");
  }
}
```

## Expect

- src/Ext/B.cs:3 -> node:Lib      # `Order` in the parameter list
- src/Ext/Use.cs:3 -> node:Lib      # `Order`
- src/Ext/Use.cs:4 -> node:Lib      # B's `Tag` is private to `B`; Lib's is the one the call binds

## Why

The project's own files counted a private method of another class as a definer and drew no edge to the method the call binds, or a false one to its own project's file.
