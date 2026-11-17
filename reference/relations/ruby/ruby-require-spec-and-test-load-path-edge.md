---
id: ruby-require-spec-and-test-load-path-edge
language: ruby
category: import
expectation: edge
cites: "RSpec puts spec/ and lib/ on the load path (`rspec --default-path`, `-I`) https://rspec.info/features/3-13/rspec-core/command-line/ ; Rails' test runner and Minitest's rake task put test/ and lib/ on it; Ruby Kernel#require https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require"
---

## Rule

A file under a `spec/` or `test/` directory has that directory on its load path, as RSpec and Rails' and Minitest's test runs put it there: `require 'spec_helper'` in `spec/models/user_spec.rb` binds `spec/spec_helper.rb`, and `require 'test_helper'` in `test/unit/order_test.rb` binds `test/test_helper.rb`. A `require` of a `./` or `../` path is read from the requiring file's directory, where a rackup file run from its own directory finds it: `require '../test_request'` in `test/cgi/test.ru` binds `test/test_request.rb`.

## Files

```ruby path=spec/spec_helper.rb
RSPEC_ROOT = 1
```

```ruby path=spec/models/user_spec.rb
require 'spec_helper'
```

```ruby path=test/test_helper.rb
TEST_ROOT = 1
```

```ruby path=test/unit/order_test.rb
require 'test_helper'
```

```ruby path=test/test_request.rb
class TestRequest; end
```

```ruby path=test/cgi/test.ru
require '../test_request'
```

## Expect

- spec/models/user_spec.rb:1 -> node:spec
- test/unit/order_test.rb:1 -> node:test
- test/cgi/test.ru:1 -> node:test

## Why

A spec or a test that loads its helper depends on it; without the test directory on the load path every such `require` would read as one that leaves the repository.
