---
id: java-primitive-class-literal-silence
language: java
category: trap
expectation: silence
cites: "JLS SE25 §15.8.2 (class literal); research G2 (C28 in 06-14)"
---

## Rule

Primitives and `void` have no `.java` file. `int.class` / `void.class` /
`boolean.class` reference primitives, not types. They are never type identifiers, so the extractor reads
nothing from them — and these tokens MUST be excluded from any type-reference walk.

## Files

```java path=src/main/java/com/app/C.java
package com.app;
class C {
  Object a = int.class;
  Object b = void.class;
  Object d = boolean.class;
}
```

## Expect

- silence      # primitive/void class literals have no .java file → never an edge

## Why

A primitive has no source file; treating `int`/`void`/`boolean` as a type would be a
phantom.
