---
id: kotlin-same-package-split-owners-silence
language: kotlin
category: trap
expectation: silence
cites: "distinct-owner rule of the shared JVM namespace"
---

## Rule

When two owners declare the same fully-qualified name (a package split over two modules that both define `com.a.Owner`), the simple name cannot be attributed to one of them from the sources, so the use binds to neither. Declarations of ONE owner (expect/actual, overloads over several files) still bind.

## Files

```kotlin path=moduleA/src/main/kotlin/com/a/Owner.kt owner=moduleA
package com.a
class Owner
```

```kotlin path=moduleB/src/main/kotlin/com/a/Owner.kt owner=moduleB
package com.a
class Owner
```

```kotlin path=moduleC/src/main/kotlin/com/a/Use.kt owner=moduleC
package com.a
class Use(val owner: Owner)
```

## Expect

- silence      # two owners define com.a.Owner

## Why

Choosing one of the two would be a guess and a likely false edge.
