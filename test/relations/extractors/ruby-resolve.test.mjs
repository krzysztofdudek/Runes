// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/ruby-resolve.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect, beforeEach, afterEach } from '../../helpers/expect.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { makeResolvePathToFile, listedFileView } from '@chrisdudek/runes/relations';
import { gemspecRequirePaths } from '../../helpers/internal/relations.mjs';

// Ruby's `require_relative '<lit>'` resolves relative to the requiring file's directory,
// `.rb` appended. These tests build a real temp tree and drive the production
// makeResolvePathToFile (disk-backed existence) through the `ruby` branch.

describe('resolveRubyRequireRelative via makeResolvePathToFile (disk-backed)', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ruby-resolve-'));
    mkdirSync(path.join(root, 'app', 'services'), { recursive: true });
    mkdirSync(path.join(root, 'app', 'models'), { recursive: true });
    writeFileSync(path.join(root, 'app', 'services', 'order_service.rb'), '# order\n', 'utf-8');
    writeFileSync(path.join(root, 'app', 'models', 'helper.rb'), '# helper\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("resolves a sibling require_relative './helper'", () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('./helper', 'app/models/order.rb', 'ruby')).toBe('app/models/helper.rb');
  });

  it('resolves a bare relative name (no leading ./) appending .rb', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('helper', 'app/models/order.rb', 'ruby')).toBe('app/models/helper.rb');
  });

  it("resolves a parent-directory require_relative '../services/order_service'", () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('../services/order_service', 'app/models/order.rb', 'ruby')).toBe(
      'app/services/order_service.rb',
    );
  });

  it('honors an explicit .rb extension without doubling it', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('./helper.rb', 'app/models/order.rb', 'ruby')).toBe('app/models/helper.rb');
  });

  it('MISS → undefined for a non-existent target (silence)', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('./nonexistent', 'app/models/order.rb', 'ruby')).toBeUndefined();
  });

  it('MISS → undefined when the relative path escapes the repo root', () => {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('../../../etc/passwd', 'app/models/order.rb', 'ruby')).toBeUndefined();
  });
});

describe('a plain require, looked up on the repository\'s load path', () => {
  const resolverOf = (contents, isExcluded) => makeResolvePathToFile('/nonexistent', undefined, isExcluded, { files: listedFileView(Object.keys(contents), (p) => contents[p]) });
  const req = (r, specifier, from = 'app/a.rb') => r(specifier, from, 'ruby', false, undefined, 'require');
  const why = (r, specifier, from = 'app/a.rb') => r.explainMiss(specifier, from, 'ruby', false, undefined, 'require');

  it('binds the file under lib/ or a gemspec\'s require_paths, never beside the requiring file', () => {
    const r = resolverOf({ 'app/a.rb': '', 'app/json.rb': '', 'lib/shop/cart.rb': '', 'gems/b/b.gemspec': 'Gem::Specification.new { |s| s.require_paths = %w[src ext] }', 'gems/b/src/b/core.rb': '', 'gems/b/ext/b/native.rb': '', 'gems/b/lib/b/old.rb': '' });
    expect(req(r, 'shop/cart')).toBe('lib/shop/cart.rb');
    expect(req(r, 'shop/cart.rb')).toBe('lib/shop/cart.rb');
    expect(req(r, 'b/core')).toBe('gems/b/src/b/core.rb');
    expect(req(r, 'b/native')).toBe('gems/b/ext/b/native.rb');
    // The gemspec names its roots, so its own lib/ is none of them.
    expect(req(r, 'b/old')).toBeUndefined();
    expect(req(r, 'json')).toBeUndefined();
    expect(why(r, 'json')).toBe('outside');
    expect(why(r, 'b/old')).toBe('outside');
    // A require_relative of the same literal still resolves beside the file.
    expect(r('json', 'app/a.rb', 'ruby')).toBe('app/json.rb');
  });
  it('a name two roots hold binds neither and names both; an excluded file is the repository\'s', () => {
    const r = resolverOf({ 'lib/x/y.rb': '', 'gems/c/c.gemspec': 'spec.require_path = "lib"', 'gems/c/lib/x/y.rb': '', 'lib/gen/z.rb': '' }, (f) => f.startsWith('lib/gen/'));
    expect(req(r, 'x/y')).toBeUndefined();
    expect(why(r, 'x/y')).toEqual({ split: ['gems/c/lib/x/y.rb', 'lib/x/y.rb'] });
    expect(req(r, 'gen/z')).toBeUndefined();
    expect(why(r, 'gen/z')).toBe('unfollowed');
  });
  it('binds nothing for a name that is absolute, empty or climbs out of its root', () => {
    const r = resolverOf({ 'lib/a.rb': '', 'top.rb': '', 'gems/d/d.gemspec': 's.require_paths = ["..", "../../../out"]', 'gems/d/inner.rb': '' });
    expect(req(r, '../top')).toBeUndefined();
    expect(req(r, '/abs/x')).toBeUndefined();
    expect(req(r, 'C:\\x')).toBeUndefined();
    expect(req(r, '')).toBeUndefined();
    expect(why(r, '../top')).toBe('outside');
    // A gemspec's root may lie above its directory (`..` from gems/d is gems/), never above the repository.
    expect(req(r, 'd/inner')).toBe('gems/d/inner.rb');
  });
  it('reads require_paths as a gemspec writes it, and RubyGems\' default lib/ otherwise', () => {
    expect(gemspecRequirePaths('spec.require_paths = ["lib", \'ext\']')).toEqual(['lib', 'ext']);
    expect(gemspecRequirePaths('s.require_paths = %w[lib  ext]')).toEqual(['lib', 'ext']);
    expect(gemspecRequirePaths('s.require_paths = %w(src)')).toEqual(['src']);
    expect(gemspecRequirePaths('s.require_paths = %W{src}')).toEqual(['src']);
    expect(gemspecRequirePaths('s.require_paths = %w<src>')).toEqual(['src']);
    expect(gemspecRequirePaths('s.require_path = "src"')).toEqual(['src']);
    expect(gemspecRequirePaths('s.require_paths = paths_from_env')).toEqual(['lib']);
    expect(gemspecRequirePaths('s.require_paths = []')).toEqual(['lib']);
    expect(gemspecRequirePaths('Gem::Specification.new do |s| s.name = "x" end')).toEqual(['lib']);
  });
});
