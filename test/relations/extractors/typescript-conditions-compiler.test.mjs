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
// A tsconfig that leaves `module`, `moduleResolution` or both unset: the compiler takes its defaults, `module` from `target` and the resolution from `module`. The rows the compiler does not resolve (Classic, which reads no `exports`) are not compared.
const DEFAULTED_SETTINGS = [
  {},
  { module: 'esnext' },
  { module: 'commonjs' },
  { module: 'es2015' },
  { module: 'es2020' },
  { module: 'es2022' },
  { module: 'amd' },
  { module: 'umd' },
  { module: 'system' },
  { module: 'none' },
  { target: 'es3' },
  { target: 'es5' },
  { target: 'es2015' },
  { target: 'es2020' },
  { target: 'es2022' },
  { target: 'esnext' },
  { target: 'es5', module: 'esnext' },
  { target: 'esnext', module: 'commonjs' },
  { moduleResolution: 'bundler' },
  { moduleResolution: 'bundler', target: 'es5' },
  { moduleResolution: 'node16' },
  { moduleResolution: 'nodenext' },
  { moduleResolution: 'node16', target: 'es5' },
  // A Node resolution with a module that is not a Node one is what a tsconfig naming only the resolution computes; the same pair written out reads the same.
  { moduleResolution: 'node16', module: 'commonjs' },
  { moduleResolution: 'nodenext', module: 'esnext' },
  { moduleResolution: 'node16', module: 'es2015' },
  { moduleResolution: 'node16', module: 'preserve' },
  { moduleResolution: 'nodenext', module: 'amd' },
  { moduleResolution: 'node16', module: 'umd' },
  { moduleResolution: 'node16', module: 'system' },
  { moduleResolution: 'node16', module: 'none' },
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
  // The heritage clause of an interface holds expressions, so the compiler reads this import() as a dynamic import call.
  interfaceExtends: "interface I extends import('lib').B {}\nexport {};",
  classImplements: "export class C implements import('lib').B {}",
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
// The `resolution-mode` import attribute names the branch itself. The compiler reads it on a type-only import or export declaration and on an import type, and nowhere else: on a declaration that imports a value it reports the attribute and resolves by the file.
const mode = (m, keyword = 'with') => `${keyword} { 'resolution-mode': '${m}' }`;
const ATTRIBUTE_FORMS = Object.fromEntries(['import', 'require'].flatMap((m) => [
  [`importType-${m}`, `import type { T } from 'lib' ${mode(m)};\nexport type U = T;`],
  [`importTypeDoubleQuoted-${m}`, `import type { T } from "lib" with { "resolution-mode": "${m}" };\nexport type U = T;`],
  [`importTypeDefault-${m}`, `import type D from 'lib' ${mode(m)};\nexport type U = D;`],
  [`importTypeNamespace-${m}`, `import type * as N from 'lib' ${mode(m)};\nexport type U = N.T;`],
  [`importTypeAssert-${m}`, `import type { T } from 'lib' ${mode(m, 'assert')};\nexport type U = T;`],
  [`exportType-${m}`, `export type { T } from 'lib' ${mode(m)};`],
  [`exportTypeStar-${m}`, `export type * from 'lib' ${mode(m)};`],
  [`importTypeNode-${m}`, `export let v: import('lib', { with: { 'resolution-mode': '${m}' } }).T;`],
  [`importTypeNodeAssert-${m}`, `export let v: import('lib', { assert: { 'resolution-mode': '${m}' } }).T;`],
  [`typeofImportNode-${m}`, `export type M = typeof import('lib', { with: { 'resolution-mode': '${m}' } });`],
  [`typeArgumentNode-${m}`, `export function f(): Promise<import('lib', { with: { 'resolution-mode': '${m}' } }).T> { return null as never; }`],
  [`heritageNode-${m}`, `export class C extends B<import('lib', { with: { 'resolution-mode': '${m}' } }).T> {}`],
  // Not type-only, so the attribute decides nothing.
  [`valueImport-${m}`, `import { v } from 'lib' ${mode(m)};\nexport const x = v;`],
  [`inlineTypeImport-${m}`, `import { type T } from 'lib' ${mode(m)};\nexport type U = T;`],
  [`valueExport-${m}`, `export { v } from 'lib' ${mode(m)};`],
  [`dynamicImportOptions-${m}`, `export const x = import('lib', { with: { 'resolution-mode': '${m}' } });`],
  [`otherAttribute-${m}`, `import type { T } from 'lib' with { type: '${m}' };\nexport type U = T;`],
]));
const EXTENSIONS = ['ts', 'tsx', 'cts', 'mts', 'js', 'jsx', 'cjs', 'mjs'];
const isTypeScriptFile = (ext) => ext === 'ts' || ext === 'tsx' || ext === 'cts' || ext === 'mts';
const PACKAGE_TYPES = [undefined, 'module', 'commonjs'];
// The package type reads only for a file whose extension does not say its format.
const packageTypesOf = (ext) => (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' ? PACKAGE_TYPES : [undefined]);

const IMPORT_FIRST = { import: './esm.d.ts', require: './cjs.d.ts' };
const REQUIRE_FIRST = { require: './cjs.d.ts', import: './esm.d.ts' };
// The string targets of an exports entry, in declaration order.
const targetsOf = (entry) => (typeof entry === 'string' ? [entry] : Object.values(entry).flatMap(targetsOf));

function fixture(ext, packageType, entry = IMPORT_FIRST) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runes-conditions-'));
  roots.push(root);
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  put('lib/package.json', JSON.stringify({ name: 'lib', exports: { '.': entry } }));
  for (const target of targetsOf(entry)) put(path.join('lib', target), 'export declare const v: number;\nexport type T = number;\n');
  put('app/package.json', JSON.stringify({ name: 'app', ...(packageType === undefined ? {} : { type: packageType }), dependencies: { lib: 'file:../lib' } }));
  mkdirSync(path.join(root, 'app/node_modules'), { recursive: true });
  symlinkSync(path.join(root, 'lib'), path.join(root, 'app/node_modules/lib'), 'dir');
  return root;
}

function compilerTarget(root, ext, code, setting, pinTarget = true) {
  const file = path.join(root, `app/use.${ext}`);
  writeFileSync(file, code);
  const options = ts.convertCompilerOptionsFromJson({ ...(pinTarget ? { target: 'esnext' } : {}), ...setting, allowJs: true, jsx: 'preserve', noEmit: true, noLib: true, skipLibCheck: true, types: [] }, root).options;
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
async function compare(settings, extensions, forms, pinTarget = true) {
  const mismatches = [];
  let compared = 0;
  for (const setting of settings) for (const ext of extensions) for (const packageType of packageTypesOf(ext)) {
    const root = fixture(ext, packageType);
    for (const [name, code] of Object.entries(forms)) {
      const compiler = compilerTarget(root, ext, code, setting, pinTarget);
      if (compiler === undefined) continue;
      compared++;
      const runes = await runesTarget(root, ext, code, setting);
      if (runes !== compiler) mismatches.push(`${JSON.stringify(setting)} ${name} in .${ext}${packageType === undefined ? '' : ` (type ${packageType})`}: compiler ${compiler}, Runes ${runes}`);
    }
  }
  return { compared, mismatches };
}

// A preset the app's tsconfig extends, installed under node_modules as a package manager leaves it. The compiler always reads it. Runes reads it when it is given the disk, and not when the path is excluded, which is how a consumer that resolves the files of a commit sees every installed package.
const PRESET = 'app/node_modules/@preset/base/tsconfig.json';
// What the app's own tsconfig sets over the preset.
const OWN_OPTIONS = [{}, { moduleResolution: 'bundler' }, { moduleResolution: 'nodenext' }, { moduleResolution: 'node16' }, { module: 'commonjs' }, { module: 'esnext' }, { module: 'nodenext' }, { module: 'node16' }, { module: 'node20' }, { module: 'preserve' }, { module: 'esnext', moduleResolution: 'bundler' }];
// What a preset may set: every module kind with the resolution it implies or is given, and the settings it may leave to the compiler's defaults.
const PRESETS = [...SETTINGS, { module: 'commonjs' }, { module: 'esnext' }, { target: 'es5' }, { moduleResolution: 'node16' }, {}];
// The option errors by which the compiler rejects a pairing of `module` and `moduleResolution`: Bundler with a module that is not commonjs, preserve or es2015 and later (5095), a Node module with another resolution (5109), a Node resolution with a module that is not a Node one (5110). A project that compiles holds none of them, so a preset that makes one with the app's own options is not a preset the app can extend.
const REJECTED_PAIRING = new Set([5095, 5109, 5110]);
// The rows whose branch the file kind or the call form fixes, whatever the preset sets.
const fixedByKindOrForm = (ext, form) => {
  // A require() call and import x = require() read require in every file; a .mts or .mjs file imports, also through import(); a .cts or .cjs file requires, except through import(), which the compiler rewrites or not by the module setting.
  if (form === 'require' || form === 'importEquals') return true;
  if (ext === 'mts' || ext === 'mjs') return true;
  return (ext === 'cts' || ext === 'cjs') && form !== 'dynamic';
};

/** What the compiler resolves `lib` to in `app/use.<ext>` through the app's tsconfig, and whether it accepts the pairing of module settings the config chain gives. */
function compilerTargetThroughConfig(root, ext, code) {
  const file = path.join(root, `app/use.${ext}`);
  writeFileSync(file, code);
  const forced = ts.convertCompilerOptionsFromJson({ allowJs: true, jsx: 'preserve', noEmit: true, noLib: true, skipLibCheck: true, types: [] }, root).options;
  const parsed = ts.getParsedCommandLineOfConfigFile(path.join(root, 'app/tsconfig.json'), forced, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const program = ts.createProgram([file], parsed.options, ts.createCompilerHost(parsed.options, true));
  const source = program.getSourceFile(file);
  let found;
  const visit = (node) => {
    if (ts.isStringLiteral(node) && node.text === 'lib') found = program.getResolvedModuleFromModuleSpecifier(node, source)?.resolvedModule?.resolvedFileName;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { target: found === undefined ? undefined : path.basename(found), accepted: !program.getOptionsDiagnostics().some((d) => REJECTED_PAIRING.has(d.code)) };
}

async function runesTargetThroughConfig(root, ext, code, seesPreset) {
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
  const deps = makeTsResolveDeps(root, seesPreset ? undefined : (p) => p.includes('node_modules/@preset/'));
  const target = hint === undefined ? undefined : resolveTsPath(hint.specifier, `app/use.${ext}`, isFile, deps, hint.callForm);
  return target === undefined ? undefined : path.basename(target);
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
  it('for a type-only import, a type-only re-export and an import type that carry the resolution-mode attribute, in every module kind', async () => {
    const { compared, mismatches } = await compare(SETTINGS, ['ts', 'tsx', 'cts', 'mts'], ATTRIBUTE_FORMS);
    // 13 module kinds x 8 (file kind, package type) rows x the forms.
    expect(compared).toBeGreaterThanOrEqual(Math.floor(13 * 8 * Object.keys(ATTRIBUTE_FORMS).length * 0.95));
    expect(mismatches).toEqual([]);
  });
  it('for the resolution-mode attribute under a tsconfig that leaves the module settings to the defaults', async () => {
    const { compared, mismatches } = await compare(DEFAULTED_SETTINGS, ['ts', 'tsx', 'cts', 'mts'], ATTRIBUTE_FORMS, false);
    // The 4 settings that compute Classic resolve nothing.
    expect(compared).toBe((DEFAULTED_SETTINGS.length - 4) * 8 * Object.keys(ATTRIBUTE_FORMS).length);
    expect(mismatches).toEqual([]);
  });
  it('for a tsconfig that leaves module, moduleResolution or both to the compiler\'s defaults, in every file kind, package type and form', async () => {
    const calls = await compare(DEFAULTED_SETTINGS, EXTENSIONS, CALL_FORMS, false);
    const typeForms = { importEquals: TYPE_FORMS.importEquals, typeofImport: TYPE_FORMS.typeofImport, importType: TYPE_FORMS.importType };
    const types = await compare(DEFAULTED_SETTINGS, ['ts', 'tsx', 'cts', 'mts'], typeForms, false);
    const compared = calls.compared + types.compared;
    const mismatches = [...calls.mismatches, ...types.mismatches];
    // Each setting gives 16 (file kind, package type) rows x 3 call forms, less the 8 require() rows of TypeScript files, plus 8 TypeScript rows x 3 type forms: 64. The 4 settings that compute Classic (amd, umd, system and none alone) resolve nothing.
    expect(compared).toBe((DEFAULTED_SETTINGS.length - 4) * 64);
    expect(mismatches).toEqual([]);
  });
  // One exports entry under every own option set, file kind, package type and form; `fixed` counts the rows whose branch the file kind or the call form fixes. With the preset read Runes gives the compiler's answer for every preset, a rejected pairing included. With the preset not read, the readings are the answers of the presets the compiler accepts: where they name one file Runes binds it, and where they differ it binds the first target in declaration order that one of them names.
  async function compareUnderPresets(entry, forms) {
    const mismatches = [];
    const count = { compared: 0, fixed: 0, decided: 0, open: 0 };
    const order = targetsOf(entry).map((target) => path.basename(target));
    for (const own of OWN_OPTIONS) for (const ext of EXTENSIONS) for (const packageType of packageTypesOf(ext)) {
      const root = fixture(ext, packageType, entry);
      mkdirSync(path.join(root, path.dirname(PRESET)), { recursive: true });
      writeFileSync(path.join(root, 'app/node_modules/@preset/base/package.json'), '{ "name": "@preset/base" }');
      writeFileSync(path.join(root, 'app/tsconfig.json'), JSON.stringify({ extends: '@preset/base/tsconfig.json', compilerOptions: own }));
      for (const [name, code] of Object.entries(forms)) {
        if (!isTypeScriptFile(ext) && (name === 'importEquals' || name === 'importType')) continue;
        const where = `${JSON.stringify(entry)}, own ${JSON.stringify(own)}, ${name} in .${ext}${packageType === undefined ? '' : ` (type ${packageType})`}`;
        const readings = new Set();
        let read = false;
        for (const preset of PRESETS) {
          writeFileSync(path.join(root, PRESET), JSON.stringify({ compilerOptions: preset }));
          const compiler = compilerTargetThroughConfig(root, ext, code);
          if (compiler.target === undefined) continue;
          read = true;
          count.compared++;
          if (compiler.accepted) readings.add(compiler.target);
          const seen = await runesTargetThroughConfig(root, ext, code, true);
          if (seen !== compiler.target) mismatches.push(`preset ${JSON.stringify(preset)} read, ${where}: compiler ${compiler.target}, Runes ${seen}`);
        }
        if (!read || readings.size === 0) continue;
        const unseen = await runesTargetThroughConfig(root, ext, code, false);
        if (fixedByKindOrForm(ext, name)) count.fixed++;
        if (readings.size === 1) {
          count.decided++;
          if (!readings.has(unseen)) mismatches.push(`preset not read, ${where}: every preset the compiler accepts gives ${[...readings][0]}, Runes ${unseen}`);
        } else {
          count.open++;
          const first = order.find((target) => readings.has(target));
          if (unseen !== first) mismatches.push(`preset not read, ${where}: the readings are ${[...readings].join(' or ')}, the first of them listed is ${first}, Runes ${unseen}`);
        }
      }
    }
    return { mismatches, count };
  }
  const PRESET_FORMS = { ...CALL_FORMS, importEquals: TYPE_FORMS.importEquals, importType: TYPE_FORMS.importType };
  it('for a tsconfig that extends an installed preset, over a package with an import and a require branch: the compiler\'s answer with the preset read; without it, the one answer of the presets the compiler accepts, else the first listed target', async () => {
    const mismatches = [];
    const count = { compared: 0, fixed: 0, decided: 0, open: 0 };
    for (const entry of [IMPORT_FIRST, REQUIRE_FIRST]) {
      const result = await compareUnderPresets(entry, PRESET_FORMS);
      mismatches.push(...result.mismatches);
      for (const key of Object.keys(count)) count[key] += result.count[key];
    }
    expect(mismatches).toEqual([]);
    // 2 orders x 11 own option sets x 56 rows (file kind, package type, form), each under 18 presets. Of the 56, the file kind or the call form fixes the branch in 24; the other 32 stay open only where the config sets no module and no Node resolution ({} and moduleResolution bundler), and everywhere else the config's own setting decides them.
    expect(count).toEqual({ compared: 2 * 11 * 56 * 18, fixed: 2 * 11 * 24, decided: 2 * (11 * 24 + 9 * 32), open: 2 * 2 * 32 });
  });
  it('for a tsconfig that extends an installed preset, over a package whose entry holds a node key: the same, with node read together with the branch each resolution enters', async () => {
    const mismatches = [];
    const count = { compared: 0, fixed: 0, decided: 0, open: 0 };
    for (const entry of [
      { node: './a.d.ts', default: './b.d.ts' },
      { default: './b.d.ts', node: './a.d.ts' },
      { node: { import: './a.d.ts', require: './b.d.ts' }, default: './c.d.ts' },
      { node: { import: './a.d.ts' }, default: './b.d.ts' },
      { node: { require: './b.d.ts' }, import: './a.d.ts', default: './c.d.ts' },
      { require: './c.d.ts', node: './a.d.ts', import: './b.d.ts' },
      { import: { node: './a.d.ts', default: './b.d.ts' }, require: './c.d.ts' },
    ]) {
      const result = await compareUnderPresets(entry, { static: CALL_FORMS.static, dynamic: CALL_FORMS.dynamic, require: CALL_FORMS.require, importEquals: TYPE_FORMS.importEquals });
      mismatches.push(...result.mismatches);
      for (const key of Object.keys(count)) count[key] += result.count[key];
    }
    expect(mismatches).toEqual([]);
    // 7 entries x 11 own option sets x 48 rows, each under 18 presets. The rows that stay open are those of a config that sets no module and no Node resolution, where the presets the compiler accepts name different files.
    expect(count).toEqual({ compared: 7 * 11 * 48 * 18, fixed: 7 * 11 * 22, decided: 3396, open: 300 });
  });
  it('for two layouts seen in the field: a CommonJS app over @tsconfig/node20 that sets module nodenext, and an app over @tsconfig/strictest that sets module preserve', async () => {
    const layouts = [
      { preset: { lib: ['es2023'], module: 'node16', target: 'es2022', strict: true, esModuleInterop: true, skipLibCheck: true, moduleResolution: 'node16' }, own: { module: 'nodenext' }, entry: IMPORT_FIRST, binds: 'cjs.d.ts' },
      { preset: { strict: true, noUncheckedIndexedAccess: true, skipLibCheck: true }, own: { module: 'preserve' }, entry: { node: './node.d.ts', default: './default.d.ts' }, binds: 'default.d.ts' },
    ];
    for (const { preset, own, entry, binds } of layouts) {
      const root = fixture('ts', undefined, entry);
      mkdirSync(path.join(root, path.dirname(PRESET)), { recursive: true });
      writeFileSync(path.join(root, 'app/node_modules/@preset/base/package.json'), '{ "name": "@preset/base" }');
      writeFileSync(path.join(root, PRESET), JSON.stringify({ compilerOptions: preset }));
      writeFileSync(path.join(root, 'app/tsconfig.json'), JSON.stringify({ extends: '@preset/base/tsconfig.json', compilerOptions: own }));
      const compiler = compilerTargetThroughConfig(root, 'ts', CALL_FORMS.static);
      expect(compiler, JSON.stringify(own)).toEqual({ target: binds, accepted: true });
      expect(await runesTargetThroughConfig(root, 'ts', CALL_FORMS.static, true), JSON.stringify(own)).toBe(binds);
      expect(await runesTargetThroughConfig(root, 'ts', CALL_FORMS.static, false), JSON.stringify(own)).toBe(binds);
    }
  });
});
