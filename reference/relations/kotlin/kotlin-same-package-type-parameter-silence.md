---
id: kotlin-same-package-type-parameter-silence
language: kotlin
category: trap
expectation: silence
cites: "Kotlin spec — Declarations: type parameters (a type parameter shadows a classifier of the same name)"
---

## Rule

A type parameter in scope shadows a type of the package with the same name. In `class Box<Owner>` and `fun <Owner> pick(o: Owner)` the name `Owner` is the type parameter, never `com.a.Owner`, so none of those mentions is a dependency. A class parameter covers the class, a function parameter that function.

## Files

```kotlin path=src/a/Owner.kt
package com.a
class Owner
```

```kotlin path=src/box/Box.kt
package com.a
class Box<Owner>(val value: Owner) {
  fun <Owner> pick(o: Owner): Owner = o
}
```

## Expect

- silence      # every Owner here is a type parameter

## Why

A type parameter named like a type of the package is legal; binding it would invent a dependency.
