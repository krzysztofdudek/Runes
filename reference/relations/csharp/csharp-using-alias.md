---
id: csharp-using-alias
language: csharp
category: import
expectation: edge
cites: "C# spec §13.4 (using_alias_directive); MS Learn — using-directive (alias)"
---

## Rule

A `using Alias = Namespace.Type;` directive binds `Alias`, for the remainder of
that file, to that exact type. The alias expansion is the NEAREST candidate for
the short name `Alias`, so a reference to `Alias` (here `new Gw()`) is a real
dependency on the node declaring `Namespace.Type` — never on a coincidental
top-level type sharing the bare alias spelling. No alias chaining: the right-hand
side is resolved in the namespace body that holds the directive (C# spec §14.6.2), with
no other using directive or alias taking part. Here the directive sits above the
namespace, in the compilation unit, so its target is read from the global namespace;
the case csharp-using-alias-target-in-namespace-edge covers a directive inside a namespace.

## Files

```csharp path=src/c/Use.cs
using Gw = Foo.Bar.IGateway;
namespace App;
class C { void M() { var x = new Gw(); } }
```

```csharp path=src/g/IGateway.cs
namespace Foo.Bar;
public class IGateway { }
```

## Expect

- src/c/Use.cs:1 -> node:g      # the directive itself names Foo.Bar.IGateway (D3 b, 185): an edge whether or not the alias is used
- src/c/Use.cs:3 -> node:g      # `new Gw()` binds the alias target Foo.Bar.IGateway (node g)

## Why

Catches a real type dependency expressed only through a using-alias — the alias
spelling never appears in the depended-on file, so only alias-aware resolution
finds the edge.
