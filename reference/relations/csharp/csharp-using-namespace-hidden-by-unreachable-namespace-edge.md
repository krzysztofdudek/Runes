---
id: csharp-using-namespace-hidden-by-unreachable-namespace-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §14.5.3 (the namespace a using namespace directive names is resolved in the body that holds it, nearest namespace first); §7.8.1 (a namespace of a project the compilation does not reference is not a member of the namespace)"
---

## Rule

`using Core;` inside `namespace A` names `A.Core` only when the compilation sees a namespace `A.Core`. Here `A.Core` is declared by a project Web does not reference, so Web sees no such namespace, the directive names the global `Core`, and `Order` binds `Core.Order` of node far.

## Files

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Far\Far.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Use.cs
namespace A
{
    using Core;
    class C { Order o; }
}
```

```xml path=src/Far/Far.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Far/Order.cs
namespace Core;
public class Order { }
```

```xml path=src/Near/Near.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Near/Other.cs
namespace A.Core;
public class Other { }
```

## Expect

- src/Web/Use.cs:4 -> node:Far      # `using Core;` names the global Core: A.Core is declared by a project Web does not reference

## Why

A nearer namespace that the compilation cannot see ended the lookup anyway, because the check asked only whether the repository declares one, so the type the code names got no edge.
