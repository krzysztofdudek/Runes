// The range check behind a `types@<range>` exports key: the modelled TypeScript version satisfies it as the compiler's own VersionRange (the pinned devDependency) answers, which also holds the modelled version to the one the repository pins.
import { describe, it, expect } from '../../helpers/expect.mjs';
import ts from 'typescript';
import { typeScriptSatisfies, MODELLED_TYPESCRIPT_VERSION } from '../../helpers/internal/relations.mjs';

const operators = ['', '<', '<=', '>', '>=', '=', '~', '^', '>= ', '~ '];
const versions = [
  '*', 'x', 'X', '6', '6.0', '6.0.3', '6.0.2', '6.0.4', '6.1', '5', '5.9', '7', '6.x', '6.0.x', '6.*.*', '0', '0.1', '0.0.1', '5.9.9',
  '6.0.3-beta', '6.0.4-0', '6.0.0-0', '1.2.3.4', 'a', 'v6', '06', '6.00', '6.0.3+build', '6.0.3-01', '6.0.3-a..b', '6.0.3-rc.1', '6.0.3-a_b', '6.0.3+a..b',
];
const ranges = new Set([
  '', '||', ' ', '|| ||', '5 - 6', '5.1 - 6.0', '6 - *', '* - 6', '* - *', '6.0.3 - 6.0.3', '6.0.4 - 7', '4 - 5.x', ' 5 -6', '5 - 6 - 7', 'x - 6', '6 - x.y',
  '>=4.7 <6', '<5 || >=6', '<5||>=6', '>=4.7 || 6.0.x', '>5.9 <6.1', '>=6 <6', '>=6.0.3-0 <6.0.3', '>6.0.3-rc.1', '<6.0.3-rc.1', '>=6.0.3-0', '<=6.0.3', '6.0.3-a.1', '>6.0.3-a.1', '<6.0.3-1',
]);
for (const o of operators) for (const v of versions) ranges.add(o + v);
for (const a of ['>=6', '<7', '5']) for (const b of ['<6.1', '>=5 ', '6.x', '||7']) ranges.add(`${a} ${b}`);

// TypeScript throws on a prerelease or build part it cannot take, where Runes reads the range as one that does not parse.
const compiler = (range) => {
  try {
    const parsed = ts.VersionRange.tryParse(range);
    return parsed === undefined ? false : parsed.test(new ts.Version(MODELLED_TYPESCRIPT_VERSION));
  } catch {
    return false;
  }
};

describe('typeScriptSatisfies', () => {
  it('models the TypeScript version the repository pins', () => {
    expect(MODELLED_TYPESCRIPT_VERSION).toBe(ts.version);
  });
  it('answers as the compiler does for every range of a table that covers each operator, wildcard, hyphen, prerelease and alternative', () => {
    for (const range of ranges) expect(typeScriptSatisfies(range), JSON.stringify(range)).toBe(compiler(range));
  });
  it('enters the empty range and a wildcard, and skips a range that does not parse', () => {
    expect(typeScriptSatisfies('')).toBe(true);
    expect(typeScriptSatisfies('*')).toBe(true);
    expect(typeScriptSatisfies('>= 4.7')).toBe(false);
    expect(typeScriptSatisfies('latest')).toBe(false);
  });
});
