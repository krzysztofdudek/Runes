---
id: kotlin-nested-class-next-line-constructor-no-val-edge
language: kotlin
category: nested
expectation: edge
cites: "Kotlin grammar — classDeclaration ({NL} primaryConstructor); ktfmt formatting of a primary constructor with modifiers; Runes issue 141"
---

## Rule

A nested class whose primary constructor sits on the line below its header and has no `val` or `var` parameter (`class Inner` over `private constructor(s: String) { class Deep }`) is one declaration to Kotlin, which attaches the constructor and its body to the class above it. The shipped grammar reads the constructor as a secondary constructor of the enclosing class without any ERROR, so the nested class's body became the constructor's block and the types declared in it were lost with no marker. The extractor joins the header to its constructor as it does when a `val` parameter makes the grammar fail, re-parses, and declares the deeper types, so `import Outer.Inner.Deep` edges.

## Files

```kotlin path=src/json/Outer.kt
package com.acme.json
class Outer {
  class Inner
  private constructor(s: String) {
    class Deep
  }
}
```

```kotlin path=src/c/Use.kt
package com.acme.app
import com.acme.json.Outer.Inner.Deep
class C
```

## Expect

- src/c/Use.kt:2 -> node:json     # the class inside the constructor's body is declared as Outer+Inner+Deep
