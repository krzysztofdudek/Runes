---
id: csharp-pattern-constant-value-of-file-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §11.2.3 (constant pattern), §12.8.4 (simple names: a member of the enclosing type is found before a type a using imports); Roslyn binds a pattern's expression first and turns to a type only when it binds none"
---

## Rule

Where the file declares a value `Config` (here `const int Config = 1`), a pattern that is not the `is` operator's own type test binds the name as an expression first, so it finds the constant: a switch arm `Config =>`, `case Config:`, `case Config when …:`, `o is not Config`, and `Config` inside an `or`, an `and` or a parenthesized pattern all test the constant and give no edge to the type `Lib.Config` the using imports.

## Files

```csharp path=src/c/Use.cs
using Lib;
namespace App;
class C {
  const int Config = 1;
  int A(object o) => o switch { Config => 1, _ => 0 };
  void B(object o) { switch (o) { case Config: break; } }
  void D(object o) { switch (o) { case Config when o is int: break; } }
  bool E(object o) => o is not Config;
  bool F(object o) => o is Config or 2;
  bool G(object o) => o is int and Config;
  bool H(object o) => o is (Config);
}
```

```csharp path=src/lib/Config.cs
namespace Lib;
public class Config {}
```

## Expect

- silence      # every pattern names the constant Config of class C, not the type of node lib

## Why

These patterns read a simple name as a type wherever it stood, so a constant of the file named like a type the file imports gave a false edge to that type.
