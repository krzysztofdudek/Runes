---
id: csharp-cyclic-base-attribute-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §15.3.2 (a class inherits the members of its base class, nested types among them); MSBuild — a project is compiled without the projects that reference it, so the T that Mid derives from is Lib's alone"
---

## Rule

A type declared in two projects of one namespace has the base lists of both parts, and when one part names a nested type through a type that derives from the other (`T : Outer.Inner`, where `Outer : T` in a project that sees only Lib's part), reading the one needs the bases of the other. Binding those bases is the same whatever file the repository lists first: the first file of App, `A.cs`, puts an attribute `[T]` on a class; the lookup binds the bases of `T` for it before any other reading of App is worked out. Lib declares `T : TBase` with a nested `Inner`, Mid declares `Outer : T`, and App declares its own part of `T` (`T : Outer.Inner`) and a field of type `Outer.Inner`; App's files are listed before Lib's, and its first file comes before the files that carry the nested reading.

## Files

```xml path=src/App/App.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Mid\Mid.csproj" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/App/A.cs
namespace N;
[T]
public class A { }
```

```csharp path=src/App/T.cs
namespace N;
public class T : Outer.Inner { }
```

```csharp path=src/App/Use.cs
namespace N;
public class Use {
  Outer.Inner f;
}
```

```xml path=src/Mid/Mid.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Mid/Outer.cs
namespace N;
public class Outer : T { }
```

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Lib/TBase.cs
namespace N;
public class TBase {
  public class Inner {
    public static void Go() { }
  }
}
```

```csharp path=src/Lib/T.cs
namespace N;
public class T : TBase { }
```

## Expect

- src/App/T.cs:2 -> node:Lib      # `Outer.Inner` is the `Inner` that `TBase` declares, reached through the bases of `Outer` and `T`
- src/App/Use.cs:3 -> node:Lib    # the same reading in a field type
- src/Mid/Outer.cs:2 -> node:Lib  # `T` as Mid sees it: the one Lib declares

## Why

The attribute is read first, and binding the bases of `T` for it meets the base list of App's own part of `T` (`Outer.Inner`), whose reading needs the bases of `T` again. That inner reading is worked out on a base list still being bound, and an answer kept from it would stay for every later `Outer.Inner` of the project, so App's `T.cs` and `Use.cs` lost their edges to `TBase.cs` depending on which file the repository listed first.
