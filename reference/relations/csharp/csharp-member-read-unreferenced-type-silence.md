---
id: csharp-member-read-unreferenced-type-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §12.8.7 (simple names: a member found by lookup in the enclosing class, inherited members included, wins over a type); MSBuild — a project sees only the assemblies it references"
---

## Rule

`Clock.Now` in a class that inherits a property `Clock` reads the property, not a type called `Clock`; a one-file reading cannot see the inherited member and offers the type as a candidate. When the only type of that name lives in a project the file's project does not reference, the candidate is dropped, because that type could not be bound there whatever the member lookup finds. Domain has no reference to Shared, so `Clock.Now` gives no edge.

## Files

```xml path=src/Domain/Domain.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
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

- silence      # Domain has no reference to Shared, so the type Acme.Clock is not a candidate

## Why

The inherited `protected IClock Clock` came from a base class of another assembly, which the syntax of this file does not show. Where the same-named type lives in a project the file does reach, the one-file reading still offers it: csharp-member-read-reachable-type-edge records that known limit.
