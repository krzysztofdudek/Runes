---
id: ruby-plain-require-load-path-edge
language: ruby
category: import
expectation: edge
cites: "Ruby Kernel#require (searches $LOAD_PATH; `.rb` is tried when the name has no extension) https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require ; RubyGems Gem::Specification#require_paths (default [\"lib\"], added to $LOAD_PATH when the gem is activated) https://guides.rubygems.org/specification-reference/#require_paths="
---

## Rule

A plain `require 'x/y'` is looked up on the load path, never beside the requiring file. The repository's load-path roots are `lib/` and every `require_paths` entry of a gemspec of the repository, under the gemspec's directory (RubyGems' default is `lib`). `require 'shop/cart'` binds `lib/shop/cart.rb`, and in a gem whose gemspec sets `require_paths = ["src"]`, `require 'billing/invoice'` binds `gems/billing/src/billing/invoice.rb`. A require no root of the repository holds (`json`, a gem) binds no file and leaves the repository: absent, `outside`.

## Files

```ruby path=lib/shop/cart.rb
module Shop
  class Cart; end
end
```

```ruby path=gems/billing/billing.gemspec
Gem::Specification.new do |spec|
  spec.name = "billing"
  spec.require_paths = ["src"]
end
```

```ruby path=gems/billing/src/billing/invoice.rb
module Billing
  class Invoice; end
end
```

```ruby path=app/main/loader.rb
require 'shop/cart'
require "billing/invoice"
require 'json'
```

## Expect

- app/main/loader.rb:1 -> node:shop
- app/main/loader.rb:2 -> node:billing
- app/main/loader.rb:1 answers resolved lib/shop/cart.rb
- app/main/loader.rb:2 answers resolved gems/billing/src/billing/invoice.rb
- app/main/loader.rb:3 answers absent outside

## Why

Most gems load their own files with `require`, so without it the edges of a gem's `lib/` tree are lost, and a consumer reporting the uses it could not follow sees none of them.
