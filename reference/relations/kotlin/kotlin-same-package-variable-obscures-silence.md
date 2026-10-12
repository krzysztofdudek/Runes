---
id: kotlin-same-package-variable-obscures-silence
language: kotlin
category: trap
expectation: silence
cites: "Kotlin spec — Scopes and identifiers (a local or a parameter shadows a classifier or function of the same name)"
---

## Rule

A capitalised receiver or callee is a type name only when no variable of that name is in scope. `fun len(Owner: String) = Owner.length` and `val Owner = lambda; Owner(1)` use a parameter or a local, never `com.a.Owner`. The extractor silences a capitalised receiver or callee when the file binds a variable of that name anywhere (a property, a parameter, a local, a lambda or catch parameter, an enum entry), reading the file as a whole, which only silences more. A type position keeps its binding.

## Files

```kotlin path=src/a/Owner.kt
package com.a
class Owner
```

```kotlin path=src/use/Use.kt
package com.a
fun len(Owner: String) = Owner.length
```

## Expect

- silence      # Owner.length is a member access on the parameter named Owner

## Why

Binding the receiver would report a dependency on `a` that the code does not have.
