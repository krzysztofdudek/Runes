---
id: csharp-is-type-test-beside-value-of-its-name-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.12.12 (the is-type operator), §7.6 (namespace and type names: only types and namespaces are looked up); Roslyn binds `e is T` to a type first, for compatibility with C# 6"
---

## Rule

`o is Config` with nothing after the name is the `is` operator's type test: C# looks `Config` up as a type first, among types and namespaces only, and reads it as a constant only where no type of that name is found. Beside a constant `Config` the file declares, the test still names the type `Lib.Config` the using imports. Where the file declares no value `Config`, every pattern form names the type: a switch arm `Config =>`, `case Config:`, `o is not Config` and `Config` inside an `or` pattern.

## Files

```csharp path=src/c/Use.cs
using Lib;
namespace App;
class C {
  const int Config = 1;
  bool A(object o) => o is Config;
}
```

```csharp path=src/d/Free.cs
using Lib;
namespace App;
class D {
  int A(object o) => o switch { Config => 1, _ => 0 };
  void B(object o) { switch (o) { case Config: break; } }
  bool E(object o) => o is not Config;
  bool F(object o) => o is Config or string;
}
```

```csharp path=src/lib/Config.cs
namespace Lib;
public class Config {}
```

## Expect

- src/c/Use.cs:5 -> node:lib       # the is-type test binds the type first, beside the constant of its name
- src/d/Free.cs:4 -> node:lib      # a switch arm, in a file that declares no value Config
- src/d/Free.cs:5 -> node:lib      # a case label
- src/d/Free.cs:6 -> node:lib      # a negated pattern
- src/d/Free.cs:7 -> node:lib      # an or pattern

## Why

Taking every pattern beside a value of the same name for that value would drop the type test of `o is Config`, which C# reads as the type, and a pattern of a file that declares no such value names the type wherever it stands.
