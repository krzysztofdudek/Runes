---
id: java-same-package-unnamed-package-silence
language: java
category: usage-site
expectation: silence
cites: "JLS SE25 §7.4.2 (the unnamed package), §7.6"
---

## Rule

A file without a `package` declaration is in the unnamed package, which has no name to share: two directories of it are one package only when a build compiles them together, and a source tree does not say so. The extractor emits no same-package candidate for a file of the unnamed package (the owner decision this takes is reported with the change).

## Files

```java path=src/main/java/Owner.java owner=main
public class Owner {}
```

```java path=src/test/java/OwnerTest.java owner=tests
class OwnerTest {
  Owner owner;
}
```

## Expect

- silence      # no package, no same-package binding

## Why

Samples, kata and generated trees put unrelated classes of the same simple name in the unnamed package of different directories; binding them would invent edges between unrelated components.
