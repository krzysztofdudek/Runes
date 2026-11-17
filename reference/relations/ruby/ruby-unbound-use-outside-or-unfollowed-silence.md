---
id: ruby-unbound-use-outside-or-unfollowed-silence
language: ruby
category: builtin
expectation: silence
cites: "Ruby Kernel#require_relative https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require_relative ; Ruby constant lookup (lexical scope, then ancestors, then Object) https://docs.ruby-lang.org/en/3.4/syntax/modules_and_classes_rdoc.html"
---

## Rule

A use that binds no file says where it points. A `require_relative` with no file names a file of the repository that is not there: absent, `unfollowed`. A constant the repository declares nothing of (`JSON`) leaves the repository: absent, `outside`, also when it is read inside a namespace of the repository first (`JSON` in `module Shop`). A constant under a namespace the repository declares that binds no file (`Shop::Missing`) is the repository's: `unfollowed`.

## Files

```ruby path=lib/shop/shop.rb
module Shop
end
```

```ruby path=lib/app/loader.rb
require_relative './missing'
x = JSON
y = Shop::Missing
module Shop
  z = JSON
end
```

## Expect

- silence      # nothing binds another owner
- lib/app/loader.rb:1 answers absent unfollowed
- lib/app/loader.rb:2 answers absent outside
- lib/app/loader.rb:3 answers absent unfollowed
- lib/app/loader.rb:5 answers absent outside

## Why

`JSON` from the standard library and a constant of the repository's own namespace that no file declares read the same to a consumer that sees only a bare absent answer; one leaves the repository and must stay quiet, the other is a use the readers could not follow.
