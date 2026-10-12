---
id: csharp-logger-of-program-own-project-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §7.8 (a type of the compilation wins over a type of the same name in a referenced assembly, warning CS0436)"
---

## Rule

`ILogger<Program>` in a class file of a project that has top-level statements names that project's own `Program`, even when a project it references declares `public partial class Program { }`: the compiler prefers the type of its own compilation to one from a referenced assembly. The candidate set of `Program` holds both, and the one in the same project is the binding, so the reference is a use of the project's own class and gives no edge to the other project.

## Files

```xml path=src/app/App.csproj
<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <ProjectReference Include="..\lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/app/Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Build().Run();
```

```csharp path=src/app/Handler.cs
namespace App;
public class Handler {
  public Handler(ILogger<Program> logger) { }
}
```

```xml path=src/lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/lib/Program.cs
public partial class Program { }
```

## Expect

- silence      # Program binds the app's own implicit class, not the referenced project's

## Why

A false edge in typical ASP.NET code with several projects; it could not be told apart from the real one before the references were read.
