---
id: csharp-pattern-constant-of-nearer-type-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §7.8.1 (the first name of a dotted name is looked up nearest scope first), §11.2.3 (constant pattern); §12.8.7 (member access through a type)"
---

## Rule

`n is Limits.Max` inside `App.Core` names the constant `Max` of the class `App.Core.Limits`: the first name binds to that class, and a constant is not a type. A namespace `Limits` of the global namespace holding a class `Max` is farther and is never reached, so the pattern gives no edge to it.

## Files

```csharp path=src/core/Limits.cs
namespace App.Core;
public class Limits { public const int Max = 1; }
```

```csharp path=src/core/Check.cs
namespace App.Core;
public class Check {
  public bool A(int n) => n is Limits.Max;
}
```

```csharp path=src/other/Max.cs
namespace Limits;
public class Max { }
```

## Expect

- silence      # Limits is the class of the same node; Limits.Max of node other is not what the pattern names

## Why

Reading a dotted constant as the type it spells, with no regard for what its first name binds to, adds a false edge to any farther type spelled the same.
