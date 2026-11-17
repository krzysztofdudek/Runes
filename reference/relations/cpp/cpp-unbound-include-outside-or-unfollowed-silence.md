---
id: cpp-unbound-include-outside-or-unfollowed-silence
language: cpp
category: builtin
expectation: silence
cites: "C++23 [cpp.include]/2-3 (an angle name is searched for in the implementation-defined places of headers; a quoted name first in an implementation-defined place, normally the includer's directory, then as an angle name)"
---

## Rule

An include that binds no file says where it points. An angle include of a header no place of the repository holds (`<vector>`) leaves the repository: absent, `outside`. A quoted include with no file (`"missing.hpp"`), or one whose path from the includer stays inside the repository (`"../gone/old.hpp"`), names a header of the repository that is not there: absent, `unfollowed`. A quoted name that climbs past the repository root leaves it: `outside`.

## Files

```cpp path=app/main.cpp
#include <vector>
#include "missing.hpp"
#include "../gone/old.hpp"
#include "../../../outside.hpp"
int main() { return 0; }
```

## Expect

- silence      # nothing binds another owner
- app/main.cpp:1 answers absent outside
- app/main.cpp:2 answers absent unfollowed
- app/main.cpp:3 answers absent unfollowed
- app/main.cpp:4 answers absent outside

## Why

A consumer that reports the uses it could not follow must tell a standard header from a header of the repository that is missing; C++ gives no other reading of either.
