// Issue 234, round four: a position a diagnostic carries is never one the parser contradicts. It is the position V8 names, or the place of an offending token only when that token is the very character V8 quotes; otherwise the file is reported without a line and column.
import { describe, it, expect } from '../helpers/expect.mjs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { makeResolvePathToFile, listedFileView } from '@chrisdudek/runes/relations';
import { parseJsoncAt, lineColumnAt, strictJsonFailure } from '../helpers/internal/relations.mjs';

const NONE = {};

describe('a structural token where a value belongs has no position', () => {
  it('strict JSON reports none for a missing value, a double comma, a trailing comma and a double colon', () => {
    expect(strictJsonFailure('{"a": }')).toEqual(NONE);
    expect(strictJsonFailure('[1,,2]')).toEqual(NONE);
    expect(strictJsonFailure('[1,]')).toEqual(NONE);
    expect(strictJsonFailure('{"a": : 1}')).toEqual(NONE);
  });

  it('a bad token later in the file is not named when the parser stopped earlier', () => {
    expect(strictJsonFailure('{"a": ,\n"b": \'x\'}')).toEqual(NONE);
    expect(parseJsoncAt('{\n  "a": ,\n  "b": 1,\n  "c": \'x\'\n}').failure).toEqual(NONE);
    expect(parseJsoncAt('{"a": }').failure).toEqual(NONE);
    expect(parseJsoncAt('{"a": : 1}').failure).toEqual(NONE);
  });

  it('a tsconfig with a missing value is reported without a position, once', () => {
    const files = { 'tsconfig.json': '{\n  "compilerOptions": {\n    "baseUrl": ,\n    "x": \'y\'\n  }\n}\n', 'src/a.ts': '' };
    const diagnostics = [];
    const resolve = makeResolvePathToFile(path.join(tmpdir(), 'diagnostics-absent-root'), undefined, undefined, {
      files: listedFileView(Object.keys(files), (p) => files[p]),
      onDiagnostic: (d) => diagnostics.push(d),
    });
    expect(resolve('@/x', 'src/a.ts', 'typescript')).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBeUndefined();
    expect(diagnostics[0].column).toBeUndefined();
    expect(diagnostics[0].message).not.toMatch(/line \d/);
  });
});

describe('whitespace is the four JSON characters only', () => {
  const cases = [
    ['no-break space', ' '],
    ['ideographic space', '　'],
    ['line separator', ' '],
    ['an inner byte order mark', '﻿'],
  ];
  for (const [name, ch] of cases) {
    it(`${name} before a value is placed at itself, not at a later bad token`, () => {
      const text = `{\n"a": ${ch}1,\n"b": 'y'\n}`;
      expect(strictJsonFailure(text)).toEqual({ line: 2, column: 6 });
      expect(parseJsoncAt(text).failure).toEqual({ line: 2, column: 6 });
    });
  }

  it('space, tab, LF and CR remain whitespace, and a CR or CRLF counts as a line', () => {
    expect(strictJsonFailure('{\t"a":\r\n 1,\r"b": \'y\'}')).toEqual({ line: 3, column: 6 });
    expect(strictJsonFailure('{\r\n"a": 1,\r\n"b": \'y\'}')).toEqual({ line: 3, column: 6 });
  });
});

describe('the message is read whole', () => {
  it('a position-looking text inside a quoted value is placed at the value, not at the number in it', () => {
    expect(strictJsonFailure('{"a": \'position 5\'}')).toEqual({ line: 1, column: 7 });
    expect(strictJsonFailure('{"a": \'in JSON at position 5\'}')).toEqual({ line: 1, column: 7 });
    expect(parseJsoncAt('{"a": \'position 5\'}').failure).toEqual({ line: 1, column: 7 });
  });

  it('an end-of-input phrase inside a value is not an unexpected end of input', () => {
    expect(strictJsonFailure('{"a": \'end of JSON input\'}')).toEqual({ line: 1, column: 7 });
  });
});

describe('the inputs verified in the earlier rounds', () => {
  it('single-quoted, unquoted, undefined, trailing garbage, BOM column, empty file, deep nesting', () => {
    expect(strictJsonFailure("{ 'a': 1 }")).toEqual({ line: 1, column: 3 });
    expect(strictJsonFailure('{ "a": \'x\' }')).toEqual({ line: 1, column: 8 });
    expect(strictJsonFailure('{ "a": x }')).toEqual({ line: 1, column: 8 });
    expect(strictJsonFailure('{ "a": undefined }')).toEqual({ line: 1, column: 8 });
    expect(strictJsonFailure('{"a":1} x')).toEqual({ line: 1, column: 9 });
    expect(strictJsonFailure('﻿{ "a" 1 }')).toEqual({ line: 1, column: 7 });
    expect(strictJsonFailure('')).toEqual({ line: 1, column: 1 });
    expect(strictJsonFailure('['.repeat(3000))).toEqual({ line: 1, column: 3001 });
    expect(strictJsonFailure('['.repeat(3000) + "'x'")).toEqual({ line: 1, column: 3001 });
    expect(parseJsoncAt('{ "a": undefined }').failure).toEqual({ line: 1, column: 8 });
    expect(parseJsoncAt('['.repeat(3000) + "'x'").failure).toEqual({ line: 1, column: 3001 });
  });
});

/** A small deterministic generator (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('mutating inputs never produces a position V8 contradicts', () => {
  const bases = [
    '{\n  "name": "x",\n  "main": "./index.js",\n  "list": [1, 2, {"k": true}]\n}\n',
    '{"compilerOptions": {"paths": {"@/*": ["./src/*"]}}, "include": ["src"]}',
    '[1, "two", null, {"three": [3.5e2, false]}]',
    '{\r\n"a": 1,\r\n"b": "text with spaces"\r\n}',
  ];
  const pieces = ["'x'", ',', ':', '}', ']', '{', '[', '"', 'undefined', 'tru', ' ', '　', ' ', '﻿', '//', '\n', '\r', '\t', '1.', '-', '\\', ' ', 'nul', "'", 'é', '😀'];

  it('over 3000 seeded mutations, a reported position is the one V8 names, or the offending character V8 quotes, or none', () => {
    const rand = seeded(234);
    let reported = 0;
    let withPosition = 0;
    for (let i = 0; i < 3000; i++) {
      let text = bases[Math.floor(rand() * bases.length)];
      const edits = 1 + Math.floor(rand() * 3);
      for (let e = 0; e < edits; e++) {
        const at = Math.floor(rand() * (text.length + 1));
        const piece = pieces[Math.floor(rand() * pieces.length)];
        const kind = rand();
        if (kind < 0.5) text = text.slice(0, at) + piece + text.slice(at);
        else if (kind < 0.8) text = text.slice(0, at) + piece + text.slice(at + 1 + Math.floor(rand() * 3));
        else text = text.slice(0, at) + text.slice(at + 1 + Math.floor(rand() * 4));
      }
      let message;
      // a BOM-led text is read without it, so ask V8 about the body the reader parses
      const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      try {
        JSON.parse(body);
        expect(strictJsonFailure(text)).toBeUndefined();
        continue;
      } catch (error) {
        message = error.message;
      }
      const failure = strictJsonFailure(text);
      reported++;
      const named = /JSON at position (\d+)(?: \(line \d+ column \d+\))?$/.exec(message);
      if (named !== null) {
        expect(failure).toEqual(lineColumnAt(body, Math.min(Number(named[1]), body.length)));
        withPosition++;
      } else if (message === 'Unexpected end of JSON input') {
        expect(failure).toEqual(lineColumnAt(body, body.length));
      } else {
        // V8 names no position: either none is given, or it is the very character V8 quotes
        const quoted = /^Unexpected token '([^]+?)', /u.exec(message);
        expect(quoted).not.toBeNull();
        if (failure.line !== undefined) {
          // find the offset back from the line and column and compare the character
          let offset = 0;
          for (;;) {
            const p = lineColumnAt(body, offset);
            if (p.line === failure.line && p.column === failure.column) break;
            offset++;
            if (offset > body.length) throw new Error('position outside the text');
          }
          expect(String.fromCodePoint(body.codePointAt(offset))).toBe(quoted[1]);
        }
      }
    }
    expect(reported).toBeGreaterThan(1500);
    expect(withPosition).toBeGreaterThan(200);
  });
});
