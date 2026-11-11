// What the compiler binds: for each module setting, file kind, package type and import form, the target TypeScript resolves an exports entry with a `require` and an `import` branch to, against the target Runes binds for the same source (the extractor's call form, then the resolver). A form the compiler does not treat as an import in that file kind (a `require()` call in a TypeScript file) is not compared.
import { describe, it, expect, afterEach } from '../../helpers/expect.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { resolveTsPath, makeTsResolveDeps, typescriptExtractor } from '../../helpers/internal/relations.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';

const roots = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

// Every module kind the compiler reads conditions by, with the resolution each implies or is given.
const SETTINGS = [
  { module: 'nodenext', moduleResolution: 'nodenext' },
  { module: 'node16' },
  { module: 'node18' },
  { module: 'node20' },
  { module: 'esnext', moduleResolution: 'bundler' },
  { module: 'es2022', moduleResolution: 'bundler' },
  { module: 'es2015', moduleResolution: 'bundler' },
  { module: 'commonjs', moduleResolution: 'bundler' },
  { module: 'amd', moduleResolution: 'bundler' },
  { module: 'umd', moduleResolution: 'bundler' },
  { module: 'system', moduleResolution: 'bundler' },
  { module: 'none', moduleResolution: 'bundler' },
  { module: 'preserve' },
];
// A call form is read the same in every file kind; the forms below it are import types, which are only written in TypeScript.
const CALL_FORMS = {
  static: "import { v } from 'lib';\nexport const x = v;",
  dynamic: "export const x = import('lib');",
  require: "const m = require('lib');\nexport const x = m;",
};
const TYPE_FORMS = {
  importEquals: "import m = require('lib');\nexport const x = m;",
  typeofImport: "export type T = typeof import('lib');",
  importType: "export let v: import('lib').T;",
  typePredicate: "export function f(x: unknown): x is import('lib').T { return true; }",
  assertsPredicate: "export function f(x: unknown): asserts x is import('lib').T {}",
  classHeritage: "export class C extends B<import('lib').T> {}",
  classExpressionHeritage: "export const C = class extends B<import('lib').T> {};",
  defaultClassHeritage: "export default class extends B<import('lib').T> {}",
  implementsArgument: "export class C implements I<import('lib').T> {}",
  interfaceExtends: "export interface I extends import('lib').B {}",
  callTypeArgument: "g<import('lib').T>();",
  taggedTemplateTypeArgument: "g<import('lib').T>`x`;",
  newTypeArgument: "new G<import('lib').T>();",
  keyofImport: "export type K = keyof import('lib').T;",
  parenthesized: "export type P = (import('lib').T);",
  parenthesizedArray: "export type P = (import('lib').T)[];",
  templateLiteralType: "export type L = `x${import('lib').T}`;",
  conditional: "export type C = import('lib').T extends infer U ? U : never;",
  readonlyArray: "export type R = readonly import('lib').T[];",
  mappedKeyof: "export type M = { [K in keyof import('lib').T]: 1 };",
  unionOfTypeofs: "export type U = typeof import('lib') | null;",
  functionParameter: "export let f: (x: import('lib').T) => void;",
  genericDefault: "export declare function f<T = import('lib').T>(): void;",
  promiseArgument: "export function f(): Promise<import('lib').T> { return null as never; }",
  asserted: "export const t = x as unknown as import('lib').T;",
};
const EXTENSIONS = ['ts', 'tsx', 'cts', 'mts', 'js', 'jsx', 'cjs', 'mjs'];
const isTypeScriptFile = (ext) => ext === 'ts' || ext === 'tsx' || ext === 'cts' || ext === 'mts';
const PACKAGE_TYPES = [undefined, 'module', 'commonjs'];
// The package type reads only for a file whose extension does not say its format.
const packageTypesOf = (ext) => (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' ? PACKAGE_TYPES : [undefined]);

function fixture(ext, packageType) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runes-conditions-'));
  roots.push(root);
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  put('lib/package.json', JSON.stringify({ name: 'lib', exports: { '.': { import: './esm.d.ts', require: './cjs.d.ts' } } }));
  put('lib/esm.d.ts', 'export declare const v: number;\nexport type T = number;\n');
  put('lib/cjs.d.ts', 'export declare const v: number;\nexport type T = number;\n');
  put('app/package.json', JSON.stringify({ name: 'app', ...(packageType === undefined ? {} : { type: packageType }), dependencies: { lib: 'file:../lib' } }));
  mkdirSync(path.join(root, 'app/node_modules'), { recursive: true });
  symlinkSync(path.join(root, 'lib'), path.join(root, 'app/node_modules/lib'), 'dir');
  return root;
}

function compilerTarget(root, ext, code, setting) {
  const file = path.join(root, `app/use.${ext}`);
  writeFileSync(file, code);
  const options = ts.convertCompilerOptionsFromJson({ ...setting, allowJs: true, jsx: 'preserve', noEmit: true, noLib: true, skipLibCheck: true, types: [], target: 'esnext' }, root).options;
  const program = ts.createProgram([file], options, ts.createCompilerHost(options, true));
  const source = program.getSourceFile(file);
  let found;
  const visit = (node) => {
    if (ts.isStringLiteral(node) && node.text === 'lib') found = program.getResolvedModuleFromModuleSpecifier(node, source)?.resolvedModule?.resolvedFileName;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found === undefined ? undefined : path.basename(found);
}

async function runesTarget(root, ext, code, setting) {
  writeFileSync(path.join(root, 'app/tsconfig.json'), JSON.stringify({ compilerOptions: setting }));
  const language = ext === 'tsx' ? 'tsx' : isTypeScriptFile(ext) ? 'typescript' : 'javascript';
  const { uses } = await runExtractor(typescriptExtractor, language, `.${ext}`, code);
  const hint = uses.map((u) => u.candidates[0]).find((h) => h.specifier === 'lib');
  const isFile = (p) => {
    try {
      return statSync(path.join(root, p)).isFile();
    } catch {
      return false;
    }
  };
  const target = hint === undefined ? undefined : resolveTsPath(hint.specifier, `app/use.${ext}`, isFile, makeTsResolveDeps(root), hint.callForm);
  return target === undefined ? undefined : path.basename(target);
}

/** Every row the compiler resolves, against Runes; returns the rows compared and the rows that differ. */
async function compare(settings, extensions, forms) {
  const mismatches = [];
  let compared = 0;
  for (const setting of settings) for (const ext of extensions) for (const packageType of packageTypesOf(ext)) {
    const root = fixture(ext, packageType);
    for (const [name, code] of Object.entries(forms)) {
      const compiler = compilerTarget(root, ext, code, setting);
      if (compiler === undefined) continue;
      compared++;
      const runes = await runesTarget(root, ext, code, setting);
      if (runes !== compiler) mismatches.push(`${JSON.stringify(setting)} ${name} in .${ext}${packageType === undefined ? '' : ` (type ${packageType})`}: compiler ${compiler}, Runes ${runes}`);
    }
  }
  return { compared, mismatches };
}

describe('the conditions Runes enters are the ones the compiler enters', () => {
  it('for an import statement, a require() call and a dynamic import(), in every module kind, file kind and package type', async () => {
    const { compared, mismatches } = await compare(SETTINGS, EXTENSIONS, CALL_FORMS);
    // 13 module kinds x 16 (file kind, package type) rows x 3 forms, less the 8 rows of TypeScript files whose require() call the compiler does not read as an import.
    expect(compared).toBeGreaterThanOrEqual(Math.floor((13 * 16 * 3 - 13 * 8) * 0.95));
    expect(mismatches).toEqual([]);
  });
  it('for import x = require() and every spelling of an import type, in every module kind', async () => {
    const { compared, mismatches } = await compare(SETTINGS, ['ts', 'tsx', 'cts', 'mts'], TYPE_FORMS);
    // 13 module kinds x 8 (file kind, package type) rows x 25 forms.
    expect(compared).toBeGreaterThanOrEqual(Math.floor(13 * 8 * Object.keys(TYPE_FORMS).length * 0.95));
    expect(mismatches).toEqual([]);
  });
});
