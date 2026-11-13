---
id: java-same-package-qualified-nested-type-edge
language: java
category: nested
expectation: edge
cites: "JLS SE25 §6.5.5.2 (a qualified type name `Q.Id`: `Q` names a type, `Id` a member type of it), §6.4.1 (a type of the package in scope without an import)"
---

## Rule

A use written `Outer.Inner`, where `Outer` is a type of the file's own package written without an import, names the member type `Inner` of `Outer`. It resolves to the file that declares `Outer.Inner`: the use of `TypeAdapters.FactorySupplier` and of `ReflectiveTypeAdapterFactory.Adapter` binds the file of the outer type, as in google/gson (`JavaTimeTypeAdapters.java:44`, `TypeAdapterRuntimeTypeWrapper.java:65` and `:99` at a961b0fe088f).

## Files

```java path=gson/src/main/java/com/google/gson/internal/bind/TypeAdapters.java owner=adapters
package com.google.gson.internal.bind;
public final class TypeAdapters {
  public interface FactorySupplier {}
}
```

```java path=gson/src/main/java/com/google/gson/internal/bind/ReflectiveTypeAdapterFactory.java owner=reflective
package com.google.gson.internal.bind;
public final class ReflectiveTypeAdapterFactory {
  public abstract static class Adapter {}
}
```

```java path=gson/src/main/java/com/google/gson/internal/bind/JavaTimeTypeAdapters.java owner=time
package com.google.gson.internal.bind;
final class JavaTimeTypeAdapters implements TypeAdapters.FactorySupplier {}
```

```java path=gson/src/main/java/com/google/gson/internal/bind/TypeAdapterRuntimeTypeWrapper.java owner=wrapper
package com.google.gson.internal.bind;
final class TypeAdapterRuntimeTypeWrapper {
  boolean reflective(Object delegate) { return delegate instanceof ReflectiveTypeAdapterFactory.Adapter; }
}
```

## Expect

- gson/src/main/java/com/google/gson/internal/bind/JavaTimeTypeAdapters.java:2 -> node:adapters
- gson/src/main/java/com/google/gson/internal/bind/TypeAdapterRuntimeTypeWrapper.java:3 -> node:reflective
- gson/src/main/java/com/google/gson/internal/bind/JavaTimeTypeAdapters.java:2 answers resolved gson/src/main/java/com/google/gson/internal/bind/TypeAdapters.java
- gson/src/main/java/com/google/gson/internal/bind/TypeAdapterRuntimeTypeWrapper.java:3 answers resolved gson/src/main/java/com/google/gson/internal/bind/ReflectiveTypeAdapterFactory.java
- gson/src/main/java/com/google/gson/internal/bind/TypeAdapterRuntimeTypeWrapper.java:3 answers absent outside

## Why

The extractor declares the nested types as `<package>.TypeAdapters+FactorySupplier`, and the use was emitted as the key `TypeAdapters.FactorySupplier`, without the package, which matched no declaration: the use gave a record that resolved to no file beside the record of the outer name. `Object` on the same line is `java.lang.Object`.
