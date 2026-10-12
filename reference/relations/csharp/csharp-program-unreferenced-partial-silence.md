---
id: csharp-program-unreferenced-partial-silence
language: csharp
category: trap
expectation: silence
cites: "MSBuild — a project sees only the assemblies it references"
---

## Rule

A project with no reference to Lib cannot see Lib's `public partial class Program { }`. Its `ILogger<Program>` names no type of the repository, and gives no edge to Lib.

## Files

```xml path=src/worker/Worker.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/worker/Job.cs
namespace Worker;
public class Job {
  public Job(ILogger<Program> logger) { }
}
```

```xml path=src/lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/lib/Program.cs
public partial class Program { }
```

## Expect

- silence      # Worker has no reference to Lib

## Why

The 1.0.0 limitation the plan listed: the type name alone said nothing about which project it came from.
