---
id: java-partially-qualified-inline-silence
language: java
category: usage-site
expectation: silence
cites: "JLS SE25 §6.5.5.2; research D2' (C23 in 06-14)"
---

## Rule

A partially-qualified inline reference `Outer.Inner` (with `Outer` same-package, no
import) is NOT a fully-qualified `scoped_type_identifier` — its leading `Outer` is a bare
simple name, not a package prefix, so no hint reads the chain as `com.a.Outer.Inner`. Its
leading simple name is a same-package reference like any other and binds to the owner of
`Outer` (see java-same-package-qualified-and-annotation-edge); here `Outer` and `X` belong to
one owner, so there is no cross-owner edge. Reading the partially-qualified chain as deeper
packages is FORBIDDEN: it would reintroduce the §6.5.5 precedence trap.

## Files

```java path=src/main/java/com/a/Outer.java
package com.a;
public class Outer {
  public static class Inner {}
}
```

```java path=src/main/java/com/a/X.java
package com.a;
class X {
  Outer.Inner i;
}
```

## Expect

- silence      # Outer binds, but to the owner of X itself: no cross-owner edge

## Why

Only the leading simple name is read, as a type of the own package; the dotted chain is never
taken for a package path.
