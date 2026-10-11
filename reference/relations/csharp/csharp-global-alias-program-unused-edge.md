---
id: csharp-global-alias-program-unused-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §7.8 (global:: alias-qualified name); C# 9+ top-level statements (the compiler's implicit global Program class)"
---

## Rule

A `using` alias whose target is written `global::Program` binds the global `Program` whether or not the alias is used. A file of top-level statements declares that class implicitly, so the alias binds the implicit class, the same fallback a bare `global::Program` reference takes.

## Files

```csharp path=src/c/Use.cs
using P = global::Program;
class C { }
```

```csharp path=src/prog/Program.cs
System.Console.WriteLine("hi");
```

## Expect

- src/c/Use.cs:1 -> node:prog     # `global::Program` reads the implicit global Program of the top-level statements file

## Why

An alias to the program's class is how a test project names the entry point, and the directive is the only line of the file that names it.
