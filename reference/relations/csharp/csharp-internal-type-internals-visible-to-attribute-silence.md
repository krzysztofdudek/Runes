---
id: csharp-internal-type-internals-visible-to-attribute-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §7.5.2 (accessibility domains); System.Runtime.CompilerServices.InternalsVisibleToAttribute — a friend assembly sees the internal types of the assembly that names it; CS0433"
---

## Rule

As in csharp-internal-type-other-project-not-candidate-edge, but Lib declares `[assembly: InternalsVisibleTo("Web")]`. Its internal `App.Order` is then accessible in Web beside Core's public one, two candidates the compiler reports as ambiguous, so `Order` in Web gives no edge.

## Files

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Core/Order.cs
namespace App;
public class Order { }
```

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Lib/Properties/AssemblyInfo.cs
using System.Runtime.CompilerServices;
[assembly: InternalsVisibleTo("Web")]
```

```csharp path=src/Lib/Order.cs
namespace App;
internal class Order { }
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Api.cs
namespace App;
public class Api {
  Order _o;
}
```

## Expect

- silence      # Lib names Web as a friend, so its internal Order is a second candidate

## Why

An internal type is out of reach of another project only while the defining project does not name it as a friend.
