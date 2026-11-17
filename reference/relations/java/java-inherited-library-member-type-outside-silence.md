---
id: java-inherited-library-member-type-outside-silence
language: java
category: nested
expectation: silence
cites: "JLS SE25 §8.5 (a class inherits the member types of its superclass and superinterfaces), §6.4.1 (an inherited member type shadows a type of the package), §6.5.5.1 (a simple type name)"
---

## Rule

Inside a class that extends a library type, a bare name the class may inherit as a member type of that type (`Entry` in a class that extends `java.util.AbstractMap`, or implements `java.util.Map`) leaves the repository when the package declares no type of that name: absent, `outside`, as `Map.Entry` written in full is. The readers cannot see the library's members, but no reading of the name names a type of the repository either, and the inherited `Map.Entry` is the one Java binds.

## Files

```java path=src/main/java/com/acme/app/Order.java
package com.acme.app;
public class Order {}
```

```java path=src/main/java/com/acme/app/Tree.java
package com.acme.app;
import java.util.AbstractMap;
import java.util.Map;
class Tree<K, V> extends AbstractMap<K, V> {
  Map.Entry<K, V> written;
  Entry<K, V> inherited;
  public java.util.Set<Map.Entry<K, V>> entrySet() { return null; }
}
```

```java path=src/main/java/com/acme/app/Table.java
package com.acme.app;
abstract class Table implements java.util.Map<String, Order> {
  Entry<String, String> row;
}
```

## Expect

- silence      # nothing binds another owner: Order is in the owner of Table
- src/main/java/com/acme/app/Tree.java:5 answers absent outside
- src/main/java/com/acme/app/Tree.java:6 answers absent outside
- src/main/java/com/acme/app/Table.java:3 answers absent outside

## Why

Read as a type of the file's own package, the bare `Entry` could not be told from a type of the repository no file declares, and a consumer that reports the uses it could not follow would report every one of them; in a sorted-map class that is most of its lines.
