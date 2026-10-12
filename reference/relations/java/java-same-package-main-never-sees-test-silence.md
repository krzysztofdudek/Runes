---
id: java-same-package-main-never-sees-test-silence
language: java
category: usage-site
expectation: silence
cites: "Maven Standard Directory Layout; Gradle source sets (main code is compiled without the test source set); JLS SE25 §7.6"
---

## Rule

Production code is compiled without the test source set, so a main class cannot name a class that only `src/test/java` declares, even in its own package. A same-package candidate from a file of `src/main` ignores the definers under `src/test` (and `src/testFixtures`, `src/integrationTest`, `src/it`, `src/jmh`) and finds nothing: there is no edge from main to test. A test class, by contrast, sees the main classes and its own set (see java-same-package-test-to-main-edge).

## Files

```java path=src/main/java/com/a/Service.java owner=main
package com.a;
class Service {
  Fixture fixture;
}
```

```java path=src/test/java/com/a/Fixture.java owner=tests
package com.a;
public class Fixture {}
```

## Expect

- silence      # the only definer of com.a.Fixture is a test class, which main code cannot see

## Why

Without the source-set rule every production class that shares a simple name with a test helper would depend on the tests, a false edge and a cycle in a graph that rightly declares tests to main.
