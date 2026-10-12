---
id: csharp-member-read-reachable-type-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §12.8.7 (simple names: an inherited member wins over a type of the same name)"
---

## Rule

A known limit, recorded so it is not mistaken for a guarantee. The reference filter drops a type the file cannot reach; it cannot tell that `Clock.Now` reads an inherited property named `Clock` when a type `Acme.Clock` is declared in a project the file does reach. The candidate stays, and the edge it gives is false in that program. It is the same edge csharp-member-read-unreferenced-type-silence removes when the type is out of reach.

## Files

```xml path=src/Domain/Domain.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Shared\Shared.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Domain/Order.cs
using Acme;
namespace Domain;
public class Order : Entity {
  public DateTime Stamp() { return Clock.Now; }
}
```

```xml path=src/Shared/Shared.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Shared/Clock.cs
namespace Acme;
public static class Clock {
  public static DateTime Now => DateTime.UtcNow;
}
```

## Expect

- src/Domain/Order.cs:4 -> node:Shared      # reachable type of the same name: a possibly false edge, the known limit

## Why

Telling the property from the type needs the members of the base class, which lives outside the file. The filter narrows the false edges to the projects a caller really references, where a declared relation is at least not a lie about the project graph.
