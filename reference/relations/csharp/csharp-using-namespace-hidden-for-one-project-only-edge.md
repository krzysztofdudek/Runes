---
id: csharp-using-namespace-hidden-for-one-project-only-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §14.5.3 (the namespace a using namespace directive names is resolved in the body that holds it, nearest namespace first); §7.8.1 (a namespace of a project the compilation does not reference is not a member of the namespace)"
---

## Rule

`using Core;` inside `namespace A` names `A.Core` only where the compilation sees a namespace `A.Core`. Near declares it. Web references Far alone, so its directive names the global `Core` and `Order` binds Far's. Web2 references Far and Near, so its directive names `A.Core`, which holds no `Order`, and binds nothing. The answer depends on the calling project and never on which file is read first.

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

```xml path=src/Web2/Web2.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Far\Far.csproj" />
    <ProjectReference Include="..\Near\Near.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web2/Use2.cs
namespace A
{
    using Core;
    class D { Order o; }
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

- src/Web/Use.cs:4 -> node:Far      # Web sees no `A.Core`: the directive names the global Core
# no edge from src/Web2/Use2.cs:4 (Web2 sees `A.Core`, which holds no Order)

## Why

The answer to whether a nearer namespace hides a reading was kept by name, so the first file asked decided it for every project.
