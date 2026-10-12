---
id: kotlin-same-package-inherited-member-type-edge
language: kotlin
category: nested
expectation: edge
cites: "Kotlin spec — Scopes and identifiers (the static scope of a class includes the nested classifiers of its supertypes)"
---

## Rule

Inside a class body a nested class of a supertype is closer than a type of the package. `Child : Base()`, `Base` declares a nested `Owner`, and the package has a top-level `Owner` too: in `Child`'s body the name `Owner` means `Base.Owner`. The extractor offers `com.a.Base+Owner` before `com.a.Owner`, so the use binds to the owner of `Base`, not to the package's `Owner`. The supertype `Base` itself is a same-package reference of its own.

## Files

```kotlin path=src/plain/Owner.kt
package com.a
class Owner
```

```kotlin path=src/base/Base.kt
package com.a
open class Base {
  class Owner
}
```

```kotlin path=src/child/Child.kt
package com.a
class Child : Base() {
  val owner: Owner? = null
}
```

## Expect

- src/child/Child.kt:2 -> node:base      # : Base(), the same-package reference
- src/child/Child.kt:3 -> node:base      # Owner is Base.Owner, not the package's Owner of node plain

## Why

The package's `Owner` would be a false edge to `plain`; the real dependency is on `base`.
