---
id: kotlin-same-package-declared-type-shadow-silence
language: kotlin
category: nested
expectation: silence
cites: "Kotlin spec — Scopes and identifiers (a declaration of the file shadows a classifier of the package)"
---

## Rule

A declaration the file itself makes, nested or local, shadows a type of the package with the same simple name. `Holder` declares a nested class `Owner` and a function declares a local one: the mentions of `Owner` in this file mean those, not `com.a.Owner`. The extractor emits no same-package candidate for any simple name the file declares anywhere (a class, object, function, property or typealias), which only ever silences more than strictly needed.

## Files

```kotlin path=src/a/Owner.kt
package com.a
class Owner
```

```kotlin path=src/holder/Holder.kt
package com.a
class Holder {
  class Owner
  val member: Owner = Owner()
  fun m() {
    class Owner
    val local = Owner()
  }
}
```

## Expect

- silence      # both Owner classes are declared in this file

## Why

The nested class is the closest binding; reporting the package's `Owner` would be a false edge.
