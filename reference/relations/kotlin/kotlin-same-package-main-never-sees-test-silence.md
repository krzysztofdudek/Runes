---
id: kotlin-same-package-main-never-sees-test-silence
language: kotlin
category: usage-site
expectation: silence
cites: "Gradle source sets (main code is compiled without the test source set); Kotlin multiplatform source sets"
---

## Rule

Production code cannot name a class that only the test source set declares, even in its own package. A same-package candidate from a file under `src/main` ignores the definers under `src/test` (and the other test-like sets), so there is no edge from main to test. The same holds for the multiplatform `commonMain`, `jvmMain` against `commonTest`, `jvmTest`.

## Files

```kotlin path=src/main/kotlin/com/a/Service.kt owner=main
package com.a
class Service(val fixture: Fixture)
```

```kotlin path=src/test/kotlin/com/a/Fixture.kt owner=tests
package com.a
class Fixture
```

## Expect

- silence      # the only declaration of com.a.Fixture is in the test source set

## Why

Binding it would invent a dependency of production code on tests, and a cycle in a graph that declares tests to main.
