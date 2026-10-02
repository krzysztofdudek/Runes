---
id: kotlin-nested-class-next-line-constructor-edge
language: kotlin
category: nested
expectation: edge
cites: "Kotlin grammar — classDeclaration ({NL} primaryConstructor); ktfmt formatting of a primary constructor with modifiers; Runes issue 018"
---

## Rule

A nested class whose primary constructor sits on the line below its header (`class Options` over `private constructor(val strings: List<String>)`, the ktfmt style) is one declaration to Kotlin, which attaches a constructor on the next line to the class above it. Inside a class body the shipped grammar instead ends the nested class at the newline and reads the constructor as a secondary constructor of the enclosing class, whose `val` parameter is an ERROR, so the enclosing class used to fall back to its header: its nested types were never declared. The extractor moves that newline into the blank after `class`, which keeps every row, re-parses, and declares the nested types again, so `import Outer.Nested` edges.

## Files

```kotlin path=src/json/Reader.kt
package com.acme.json
abstract class Reader {
  class Options
  private constructor(val strings: List<String>) {
    fun size(): Int = strings.size
  }

  enum class Token {
    BEGIN,
    END,
  }
}
```

```kotlin path=src/c/Use.kt
package com.acme.app
import com.acme.json.Reader.Options
import com.acme.json.Reader.Token
class C
```

## Expect

- src/c/Use.kt:2 -> node:json     # the nested class with the next-line constructor is declared as Reader+Options
- src/c/Use.kt:3 -> node:json     # its sibling after it is declared as Reader+Token
