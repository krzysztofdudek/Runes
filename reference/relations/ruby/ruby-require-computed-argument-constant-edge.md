---
id: ruby-require-computed-argument-constant-edge
language: ruby
category: dynamic
expectation: edge
cites: "Ruby Kernel#require https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require"
---

## Rule

A `require` whose argument is not a plain string literal gives no path use, but the constants its argument names are still read as uses: `require "#{Shop::ROOT}/x"` and `require Shop::Cart.path` each use `Shop`'s constants, which bind the file that declares them.

## Files

```ruby path=lib/shop/shop.rb
module Shop
  ROOT = "lib"
  class Cart
    def self.path = "lib/shop/cart"
  end
end
```

```ruby path=app/main/loader.rb
require "#{Shop::ROOT}/x"
require Shop::Cart.path
```

## Expect

- app/main/loader.rb:1 -> node:shop
- app/main/loader.rb:2 -> node:shop

## Why

Reading a computed `require` as a path would guess; skipping its argument altogether would lose the constant uses every other call keeps.
