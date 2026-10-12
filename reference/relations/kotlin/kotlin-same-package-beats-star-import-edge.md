---
id: kotlin-same-package-beats-star-import-edge
language: kotlin
category: trap
expectation: edge
cites: "Kotlin spec — Packages and imports (explicit imports, then the same package, then star imports, then default imports)"
---

## Rule

A star import is weaker than a declaration of the file's own package: in `Use`, `Owner` means `com.a.Owner` although `import com.x.*` offers a `com.x.Owner` too. The star import keeps its own edge (to the package it names, as before); the use binds to the package's `Owner`.

## Files

```kotlin path=src/a/Owner.kt
package com.a
class Owner
```

```kotlin path=src/x/Owner.kt
package com.x
class Owner
```

```kotlin path=src/use/Use.kt
package com.a
import com.x.*
class Use(val o: Owner)
```

## Expect

- src/use/Use.kt:2 -> node:x      # the star import's own edge, unchanged
- src/use/Use.kt:3 -> node:a      # the use: the package's type beats the star import

## Why

Resolving the name through the star import would hide the real dependency on `a` and invent one on `x`.
