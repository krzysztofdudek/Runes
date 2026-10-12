---
id: kotlin-same-package-root-package-silence
language: kotlin
category: usage-site
expectation: silence
cites: "Kotlin spec — Packages (the root package)"
---

## Rule

A file without a `package` header is in the root package, which has no name to share: two directories of it are one package only when a build compiles them together, and a source tree does not say so. The extractor emits no same-package candidate for a file of the root package (the owner decision this takes is reported with the change).

## Files

```kotlin path=src/main/kotlin/Owner.kt owner=main
class Owner
```

```kotlin path=src/test/kotlin/OwnerTest.kt owner=tests
class OwnerTest(val owner: Owner)
```

## Expect

- silence      # no package, no same-package binding

## Why

Scripts and samples put unrelated classes of the same simple name in the root package of different directories; binding them would invent edges between unrelated components.
