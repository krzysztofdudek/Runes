---
id: csharp-project-reference-without-output-assembly-conditional-silence
language: csharp
category: trap
expectation: silence
cites: "MSBuild — a condition decides whether an item or its metadata applies; the reader never evaluates one"
---

## Rule

`ReferenceOutputAssembly="false"` under a `Condition` (on the item or its `ItemGroup`) or with a value this reader cannot read (`$(Hide)`) may not apply, so the referenced project stays visible. The answer fails open: both `Clock` types are candidates and the name is ambiguous, so there is no edge.

## Files

```xml path=src/Api/Api.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Api/Clock.cs
namespace App;
public class Clock { }
```

```xml path=src/Worker/Worker.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Worker/Clock.cs
namespace App;
public class Clock { }
```

```xml path=src/Tests/Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Api\Api.csproj" />
    <ProjectReference Include="..\Worker\Worker.csproj" ReferenceOutputAssembly="false" Condition="'$(Configuration)' == 'Release'" />
  </ItemGroup>
</Project>
```

```csharp path=src/Tests/ClockTests.cs
namespace App.Tests;
public class ClockTests {
  Clock _c;
}
```

## Expect

- silence      # the hiding may not apply, so both Clock types are candidates

## Why

Treating a conditional hiding as certain would drop a real edge in the configuration where the reference does flow.
