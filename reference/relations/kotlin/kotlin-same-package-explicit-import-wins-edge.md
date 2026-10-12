---
id: kotlin-same-package-explicit-import-wins-edge
language: kotlin
category: trap
expectation: edge
cites: "Kotlin spec — Packages and imports (an explicit import has the highest priority); aliased imports"
---

## Rule

An explicit import beats a declaration of the same package. `import com.b.Owner` in a file of package `com.a` makes `Owner` mean `com.b.Owner`, although `com.a.Owner` exists: the import gives its edge and the later mentions emit no same-package candidate. An ALIAS binds only its alias: after `import com.b.Owner as Imported` the simple name `Owner` still means the package's own type, and the alias `Imported` is the import. Both uses below bind: `Owner` to the package's type (node a), the alias to the import's target (the import line, node b).

## Files

```kotlin path=src/a/Owner.kt
package com.a
class Owner
```

```kotlin path=src/b/Owner.kt
package com.b
class Owner
```

```kotlin path=src/c/Plain.kt
package com.a
import com.b.Owner
class Plain(val o: Owner)
```

```kotlin path=src/d/Aliased.kt
package com.a
import com.b.Owner as Imported
class Aliased(val o: Owner, val i: Imported)
```

## Expect

- src/c/Plain.kt:2 -> node:b      # the import wins; line 3 binds to nothing of its own
- src/d/Aliased.kt:2 -> node:b      # the aliased import
- src/d/Aliased.kt:3 -> node:a      # Owner is still the package's type; Imported is the alias

## Why

Binding the simple name through the package after a plain import would turn a correct dependency on `b` into a false one on `a`; ignoring the package after an alias would lose a real one.
