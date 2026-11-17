---
id: ruby-framework-namespace-reopened-by-an-application-outside-silence
language: ruby
category: trap
expectation: silence
cites: "Rails test_helper.rb template (`module ActiveSupport` / `class TestCase`), railties v7.1.0 and v8.0.0 https://github.com/rails/rails/blob/v8.0.0/railties/lib/rails/generators/rails/app/templates/test/test_helper.rb.tt ; Ruby constant lookup https://docs.ruby-lang.org/en/3.4/syntax/modules_and_classes_rdoc.html"
---

## Rule

An application that only reopens a framework's namespace is not that framework. Rails' generated `test/test_helper.rb` writes `module ActiveSupport` and `class TestCase` around the test setup, so the repository declares `ActiveSupport` and `ActiveSupport::TestCase`, but no file that the require name of the namespace or of a longer prefix of the name loads (`require 'active_support'`, `require 'active_support/test_case'`) declares that prefix: the application holds no `lib/active_support.rb` and no `active_support/test_case.rb` on a load path. A use of `ActiveSupport::Concern` or `ActiveSupport::TestCase` leaves the repository: absent, `outside`.

## Files

```ruby path=test/test_helper.rb
module ActiveSupport
  class TestCase
    parallelize(workers: :number_of_processors)
  end
end
```

```ruby path=app/models/user.rb
class User
  extend ActiveSupport::Concern
end
```

```ruby path=test/models/user_test.rb
class UserTest < ActiveSupport::TestCase
end
```

## Expect

- silence      # a framework namespace never binds in the edge walk
- app/models/user.rb:2 answers absent outside
- test/models/user_test.rb:1 answers absent outside

## Why

Every Rails application since 7.1 has this file; reading its reopening as the repository's own namespace would turn every use of ActiveSupport into one the readers could not follow.
