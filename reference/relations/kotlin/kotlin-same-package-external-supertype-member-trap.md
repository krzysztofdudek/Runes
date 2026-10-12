---
id: kotlin-same-package-external-supertype-member-trap
language: kotlin
category: trap
expectation: edge
cites: "Kotlin spec — Scopes and identifiers (nested classifiers of supertypes are in scope in the body)"
---

## Rule

KNOWN LIMIT, documented rather than fixed. A class body sees the nested classifiers of its supertypes, which shadow a type of the package. When the supertype is outside the repository (`ExternalBase` below) the extractor cannot know which classifiers it declares, so a simple name that is also a type of the package binds to the package's type. The edge is false exactly when `ExternalBase` really declares a nested `Owner`, which needs a name collision across a library boundary and a split of the package over another owner. A supertype in the repository is handled (see kotlin-same-package-inherited-member-type-edge).

## Files

```kotlin path=src/a/Owner.kt
package com.a
class Owner
```

```kotlin path=src/use/Use.kt
package com.a
class Use : ExternalBase() {
  val owner: Owner? = null
}
```

## Expect

- src/use/Use.kt:3 -> node:a      # edge assumed; false only when ExternalBase declares its own nested Owner

## Why

Silencing every class with an external supertype would drop most real same-package edges.
