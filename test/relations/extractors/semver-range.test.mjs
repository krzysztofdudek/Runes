// The semver range check the TS resolver uses to decide whether a package manager links a workspace package: node-semver's `satisfies(version, range, { loose: true })`, whose desugaring (replaceCaret, replaceTilde, replaceXRange, hyphenReplace) each row below follows.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { satisfiesRange } from '../../helpers/internal/relations.mjs';

const rows = [
  // [range, version, expected]
  ['^1.2.3', '1.9.0', true], ['^1.2.3', '2.0.0', false], ['^1.2.3', '1.2.2', false],
  ['^0.2.3', '0.2.9', true], ['^0.2.3', '0.3.0', false],
  ['^0.0.3', '0.0.3', true], ['^0.0.3', '0.0.4', false],
  ['^0.0', '0.0.9', true], ['^0.0', '0.1.0', false],
  ['^1.x', '1.5.0', true], ['^1.x', '2.0.0', false], ['^1.2', '1.9.9', true], ['^0.x', '0.9.0', true], ['^*', '9.0.0', true],
  ['~1.2.3', '1.2.9', true], ['~1.2.3', '1.3.0', false], ['~1.2', '1.2.0', true], ['~1', '1.9.0', true], ['~1', '2.0.0', false], ['~>1.2.3', '1.2.5', true], ['~*', '3.0.0', true],
  ['~1.2.3-beta.2', '1.2.3-beta.4', true], ['~1.2.3-beta.2', '1.2.3-beta.1', false], ['~1.2.3-beta.2', '1.2.4-beta.1', false],
  ['1.x', '1.4.0', true], ['1.x', '2.0.0', false], ['1.2.*', '1.2.7', true], ['1.2', '1.3.0', false], ['*', '0.0.1', true], ['', '7.0.0', true], ['x', '1.0.0', true],
  ['>1', '2.0.0', true], ['>1', '1.9.9', false], ['>1.2', '1.3.0', true], ['>1.2', '1.2.9', false],
  ['<1.2', '1.1.9', true], ['<1.2', '1.2.0', false], ['<=1.2', '1.2.9', true], ['<=1.2', '1.3.0', false], ['<=1', '1.9.0', true],
  ['>=1.2', '1.2.0', true], ['>=1.x', '0.9.0', false], ['>*', '1.0.0', false], ['<*', '1.0.0', false], ['>=*', '1.0.0', true], ['=1.x', '1.1.0', true],
  ['>=1.2.3 <2', '1.5.0', true], ['>= 1.2.3 < 2', '2.0.0', false], ['=1.2.3', '1.2.3', true], ['v1.2.3', '1.2.3', true], ['1.2.3', 'v1.2.3', true], ['1.2.3', '1.2.4', false],
  ['>1.2.3', '1.2.4', true], ['<=1.2.3', '1.2.3', true], ['<1.2.3', '1.2.3', false],
  ['1.2.3 - 2.3.4', '2.3.4', true], ['1.2.3 - 2.3.4', '2.3.5', false], ['1.2 - 2.3', '2.3.9', true], ['1.2 - 2.3', '1.1.9', false], ['1 - 2', '2.9.9', true], ['1 - 2', '3.0.0', false], ['* - 2', '0.1.0', true], ['* - *', '5.0.0', true], ['1.0.0-rc.1 - 2.0.0-rc.1', '2.0.0-rc.1', true],
  ['^1.0.0 || ^2.0.0', '2.1.0', true], ['^1.0.0 || ^3.0.0', '2.1.0', false],
  // A prerelease satisfies a set only through a comparator with a prerelease on the same major, minor and patch.
  ['^1.2.3', '1.3.0-beta', false], ['^1.2.3-alpha', '1.2.3-beta', true], ['^1.2.3-alpha', '1.2.4-beta', false], ['*', '1.0.0-beta', false],
  ['>=1.0.0-alpha.1', '1.0.0-alpha.beta', true], ['>=1.0.0-alpha.beta', '1.0.0-alpha.1', false], ['>=1.0.0-alpha', '1.0.0-alpha.1', true], ['>=1.0.0-alpha.1', '1.0.0-alpha', false], ['>=1.0.0-2', '1.0.0-10', true], ['>=1.0.0-b', '1.0.0-a', false], ['>=1.0.0-a', '1.0.0', true], ['<=1.0.0-a', '1.0.0', false],
  ['1.2.3beta', '1.2.3-beta', true],
];

describe('satisfiesRange', () => {
  it('answers as node-semver satisfies with loose reading', () => {
    for (const [range, version, expected] of rows) expect(satisfiesRange(version, range), `${version} in ${range}`).toBe(expected);
  });
  it('a version that does not parse satisfies nothing', () => {
    expect(satisfiesRange('1.2', '*')).toBe(false);
    expect(satisfiesRange('next', '^1.0.0')).toBe(false);
  });
  it('is undefined for what is no range: a tag, a protocol, a broken hyphen range', () => {
    for (const range of ['latest', 'workspace:*', 'npm:lib@^1.0.0', 'github:a/b', '^1.2.3 junk', 'a - 2.0.0', '1.0.0 - b']) expect(satisfiesRange('1.0.0', range), range).toBeUndefined();
  });
});
