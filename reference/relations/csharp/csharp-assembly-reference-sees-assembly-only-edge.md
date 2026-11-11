---
id: csharp-assembly-reference-sees-assembly-only-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — a <Reference> with a HintPath hands the compiler that one assembly; the references of the project that built it are not passed on"
---

## Rule

A `<Reference>` with a `HintPath` names a built assembly. The referencing project sees that assembly only, never the projects the assembly's own project references: nothing in a built file carries them. ApiFuzz references Acme.Api and Acme.Lib by HintPath; Acme.Api itself references Acme.Core, whose `App.Order` stays out of ApiFuzz's sight, so `Order` binds Acme.Lib's.

## Files

```xml path=fuzz/ApiFuzz/ApiFuzz.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Reference Include="Acme.Api">
      <HintPath>..\..\src\Acme.Api\bin\Release\net8.0\Acme.Api.dll</HintPath>
    </Reference>
    <Reference Include="Acme.Lib">
      <HintPath>..\..\src\Acme.Lib\bin\Release\net8.0\Acme.Lib.dll</HintPath>
    </Reference>
  </ItemGroup>
</Project>
```

```csharp path=fuzz/ApiFuzz/Program.cs
using App;
namespace ApiFuzz;
public class Harness {
  Order _o;
}
```

```xml path=src/Acme.Api/Acme.Api.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup><ProjectReference Include="..\Acme.Core\Acme.Core.csproj" /></ItemGroup>
</Project>
```

```csharp path=src/Acme.Api/ApiClient.cs
namespace App.Api;
public class ApiClient { }
```

```xml path=src/Acme.Core/Acme.Core.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Acme.Core/Order.cs
namespace App;
public class Order { }
```

```xml path=src/Acme.Lib/Acme.Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Acme.Lib/Order.cs
namespace App;
public class Order { }
```

## Expect

- fuzz/ApiFuzz/Program.cs:4 -> node:Acme.Lib      # Acme.Core is a reference of the project that built Acme.Api, not of ApiFuzz

## Why

A fuzzing project that links built assemblies was given everything those assemblies' projects reference, which made the names they declare ambiguous.
