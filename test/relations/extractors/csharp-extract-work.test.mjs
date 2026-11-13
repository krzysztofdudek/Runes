// The work the C# extractor does on a file, counted in calls to the tree-sitter runtime: a step of a walk and the type of a node each cross into the runtime and cost about the same, so the calls per node of the file are the extractor's parse time, counted the same on every machine. The count is taken through the runtime's accessors, wrapped for the duration of one run.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as TreeSitter from 'web-tree-sitter';
import { csharpExtractor, extractCsharpRefs } from '@chrisdudek/runes/relations';
import { outermostOfType } from '../../helpers/internal/relations.mjs';
import { withParsedFile, parsedFile } from '../../helpers/tree-sitter.mjs';

const range = (n) => Array.from({ length: n }, (_, i) => i);

/** A file of the shape a service layer has: usings, a file-scoped namespace, and `n` classes with fields, a property, a constructor and methods full of statements. */
const serviceFile = (n) =>
  [
    'using System;',
    'using System.Collections.Generic;',
    'using Shop.Core;',
    'using static Shop.Core.Guard;',
    'using Repo = Shop.Data.Repository<Shop.Core.Order>;',
    '',
    'namespace Shop.Services;',
    '',
    ...range(n).map((i) =>
      [
        '[Service(Lifetime.Scoped)]',
        `public sealed partial class OrderService${i}<T> : ServiceBase<T>, IOrderService${i} where T : class, IEntity`,
        '{',
        '    private readonly IRepository<Order> _orders;',
        `    private readonly ILogger<OrderService${i}<T>> _logger;`,
        '    public int Count { get; private set; }',
        `    public OrderService${i}(IRepository<Order> orders, ILogger<OrderService${i}<T>> logger) { _orders = orders; _logger = logger; }`,
        '    public async Task<IReadOnlyList<OrderDto>> ListAsync(Guid customerId, CancellationToken ct = default)',
        '    {',
        '        NotNull(customerId);',
        '        var items = await _orders.Query().Where(o => o.CustomerId == customerId && o.Status != OrderStatus.Cancelled).ToListAsync(ct);',
        '        if (items is null || items.Count == 0) { _logger.LogInformation("none for {Id}", customerId); return Array.Empty<OrderDto>(); }',
        '        foreach (Order order in items) { Count += order.Lines.Count; if (order is Models.Archived archived) { archived.Touch(); } }',
        '        var result = new List<OrderDto>(items.Count);',
        '        for (var k = 0; k < items.Count; k++) { result.Add(Mapper.Map<OrderDto>(items[k]) with { Index = k }); }',
        '        try { return result.AsReadOnly(); } catch (InvalidOperationException ex) when (ex.Message.Length > 0) { throw new ServiceException(nameof(ListAsync), ex); }',
        '    }',
        `    public override string ToString() => $"OrderService${i}({Count})";`,
        '}',
        '',
      ].join('\n'),
    ),
  ].join('\n');

/** The nodes of a tree, each one counted once. */
function nodeCount(tree) {
  const cursor = tree.rootNode.walk();
  let count = 0;
  let depth = 0;
  try {
    for (;;) {
      count++;
      if (cursor.gotoFirstChild()) {
        depth++;
        continue;
      }
      while (depth > 0 && !cursor.gotoNextSibling()) {
        cursor.gotoParent();
        depth--;
      }
      if (depth === 0) return count;
    }
  } finally {
    cursor.delete();
  }
}

/** Runs `fn` with the runtime's reads of a node's type and a walk's visits of a node counted, and returns the counts. */
function countWork(fn) {
  const counted = [
    [TreeSitter.Node.prototype, 'typeId', 'typeReads'],
    [TreeSitter.TreeCursor.prototype, 'currentNode', 'visits'],
  ];
  const counts = { typeReads: 0, visits: 0 };
  const originals = counted.map(([proto, key]) => [proto, key, Object.getOwnPropertyDescriptor(proto, key)]);
  for (const [proto, key, name] of counted) {
    const original = Object.getOwnPropertyDescriptor(proto, key);
    Object.defineProperty(proto, key, {
      ...original,
      get() {
        counts[name]++;
        return original.get.call(this);
      },
    });
  }
  try {
    fn();
  } finally {
    for (const [proto, key, original] of originals) Object.defineProperty(proto, key, original);
  }
  return counts;
}

/** The nodes of `type` a walk that does not descend into one of them visits, in document order. */
function outermostByWalk(root, type) {
  const out = [];
  const cursor = root.walk();
  let depth = 0;
  try {
    for (;;) {
      const node = cursor.currentNode;
      const hit = node.type === type;
      if (hit) out.push(node);
      if (!hit && cursor.gotoFirstChild()) {
        depth++;
        continue;
      }
      while (depth > 0 && !cursor.gotoNextSibling()) {
        cursor.gotoParent();
        depth--;
      }
      if (depth === 0) return out;
    }
  } finally {
    cursor.delete();
  }
}

describe('csharp extractor — the nodes of one type, the outermost only', () => {
  const code = [
    'using A.B.C;',
    'global using static Shop.Core.Guard;',
    'using Repo = Shop.Data.Repository<Shop.Core.Order>;',
    'namespace Outer.Inner',
    '{',
    '    using Models.Orders;',
    '    namespace Deep { using X = global::Lib.Y.Z; class C : Shop.Core.Base<App.Models.Order> { App.Models.Line l; } }',
    '}',
  ].join('\n');

  for (const type of ['using_directive', 'qualified_name', 'namespace_declaration']) {
    it(`gives the ${type} nodes a walk gives that does not descend into one`, async () => {
      await withParsedFile('Nested.cs', code, (tree) => {
        const expected = outermostByWalk(tree.rootNode, type).map((n) => [n.startIndex, n.endIndex]);
        assert.ok(expected.length > 0, `the sample has a ${type}`);
        assert.deepEqual(outermostOfType(tree.rootNode, type).map((n) => [n.startIndex, n.endIndex]), expected);
      });
    });
  }

  it('leaves out a node that sits inside another of its type', async () => {
    await withParsedFile('Nested.cs', code, (tree) => {
      // `A.B.C` is a qualified name holding the qualified name `A.B`, and the namespace `Deep` sits inside `Outer.Inner`.
      assert.ok(tree.rootNode.descendantsOfType('qualified_name').length > outermostOfType(tree.rootNode, 'qualified_name').length);
      assert.deepEqual(outermostOfType(tree.rootNode, 'namespace_declaration').map((n) => n.childForFieldName('name').text), ['Outer.Inner']);
    });
  });
});

describe('csharp extractor — the work on one file', () => {
  it('reads a file in three walks and asks each node its type a few times, both halves together', async () => {
    const code = serviceFile(20);
    await withParsedFile('Services.cs', code, (tree) => {
      const nodes = nodeCount(tree);
      const file = parsedFile('Services.cs', code, tree, 'csharp');
      const { typeReads, visits } = countWork(() => {
        csharpExtractor.declarations(file);
        extractCsharpRefs(file);
      });
      // Three walks over every node: the declarations, the names the file declares with the scope of every node, and the references. Reading every node again for one fact (the file-scoped namespace, the using directives, the file's own types) cost 11 walks and 57 type reads per node, about twice the parse time of Runes 1.0.0.
      assert.ok(visits / nodes <= 3.5, `${visits} node visits for ${nodes} nodes: ${(visits / nodes).toFixed(2)} walks of the file`);
      assert.ok(typeReads / nodes <= 10, `${typeReads} type reads for ${nodes} nodes: ${(typeReads / nodes).toFixed(2)} per node`);
    });
  });
});
