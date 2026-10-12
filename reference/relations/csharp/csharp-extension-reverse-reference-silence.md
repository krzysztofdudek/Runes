---
id: csharp-extension-reverse-reference-silence
language: csharp
category: trap
expectation: silence
cites: "MSBuild — project references are directed: Shared referencing Domain does not let Domain see Shared"
---

## Rule

References point one way. Shared references Domain, so Shared may use Domain's types; Domain cannot see Shared. Domain's `lines.ForEach(...)` on a `List<int>` is the framework's method, and Shared's `ForEach` extension is not a candidate for it, so no edge Domain → Shared appears and no declared relation Domain → Shared is ever forced, which a cycle with the real Shared → Domain relation would have made impossible.

## Files

```xml path=src/Domain/Domain.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Domain/Order.cs
using System.Collections.Generic;
namespace Shop.Domain;
public class Order {
  public void Each(List<int> lines) { lines.ForEach(Touch); }
  private static void Touch(int line) { }
}
```

```xml path=src/Shared/Shared.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Domain\Domain.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Shared/EnumerableExtensions.cs
namespace Shop;
public static class EnumerableExtensions {
  public static void ForEach<T>(this IEnumerable<T> items, System.Action<T> act) { }
}
```

## Expect

- silence      # no edge Domain -> Shared: Domain is inside the namespace Shop that Shared's extension lives in, but cannot reference Shared's assembly

## Why

A false edge in the direction opposite to a real reference cannot be suppressed and turns the architecture into a cycle.
