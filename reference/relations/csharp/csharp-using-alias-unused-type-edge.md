---
id: csharp-using-alias-unused-type-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §13.4 (using_alias_directive — the alias is bound for the whole file, whether or not it is used); §13.8 (compilation unit: the directive names its target when it is resolved)"
---

## Rule

A `using Alias = Namespace.Type;` directive to a type gives the edge to that type whether or not the alias is ever used. The compiler resolves the target when it binds the directive, and removing the type breaks the build even when no line names the alias. This is the same as `using static Namespace.Type;`, which also gives its edge without any use.

## Files

```csharp path=src/c/Use.cs
using Gw = Foo.Bar.IGateway;
namespace App;
class C { void M() { } }
```

```csharp path=src/g/IGateway.cs
namespace Foo.Bar;
public class IGateway { }
```

## Expect

- src/c/Use.cs:1 -> node:g      # the directive binds Foo.Bar.IGateway although no line uses the alias

## Why

An alias that is declared but not used is still a dependency the compiler checks, and a graph that drops it cannot see a dependency that a later use would add without any change to the directive.
