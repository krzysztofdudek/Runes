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
const EXTENSIONS = ['ts', 'tsx', 'cts', 'mts', 'js', 'jsx', 'cjs', 'mjs'];
const isTypeScriptFile = (ext) => ext === 'ts' || ext === 'tsx' || ext === 'cts' || ext === 'mts';
const PACKAGE_TYPES = [undefined, 'module', 'commonjs'];
// The package type reads only for a file whose extension does not say its format.
const packageTypesOf = (ext) => (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' ? PACKAGE_TYPES : [undefined]);

function fixture(ext, packageType, requireFirst = false) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runes-conditions-'));
  roots.push(root);
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  put('lib/package.json', JSON.stringify({ name: 'lib', exports: { '.': requireFirst ? { require: './cjs.d.ts', import: './esm.d.ts' } : { import: './esm.d.ts', require: './cjs.d.ts' } } }));
  put('lib/esm.d.ts', 'export declare const v: number;\nexport type T = number;\n');
  put('lib/cjs.d.ts', 'export declare const v: number;\nexport type T = number;\n');
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
const OWN_OPTIONS = [{}, { moduleResolution: 'bundler' }, { moduleResolution: 'nodenext' }, { module: 'commonjs' }, { module: 'esnext' }, { module: 'nodenext' }, { module: 'preserve' }, { module: 'esnext', moduleResolution: 'bundler' }];
// The rows whose branch the file kind or the call form fixes, whatever the preset sets.
const fixedByKindOrForm = (ext, form) => {
  // A require() call and import x = require() read require in every file; a .mts or .mjs file imports, also through import(); a .cts or .cjs file requires, except through import(), which the compiler rewrites or not by the module setting.
  if (form === 'require' || form === 'importEquals') return true;
  if (ext === 'mts' || ext === 'mjs') return true;
  return (ext === 'cts' || ext === 'cjs') && form !== 'dynamic';
};

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
  return found === undefined ? undefined : path.basename(found);
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
  it('for a tsconfig that extends an installed preset: the compiler\'s answer with the preset read, and without it the branch the file kind or the call form fixes, else the first listed target', async () => {
    const forms = { ...CALL_FORMS, importEquals: TYPE_FORMS.importEquals, importType: TYPE_FORMS.importType };
    const presets = [...SETTINGS, { module: 'commonjs' }, { module: 'esnext' }, { target: 'es5' }, {}];
    const mismatches = [];
    let compared = 0;
    let fixed = 0;
    for (const requireFirst of [false, true]) for (const own of OWN_OPTIONS) for (const ext of EXTENSIONS) for (const packageType of packageTypesOf(ext)) {
      const root = fixture(ext, packageType, requireFirst);
      mkdirSync(path.join(root, path.dirname(PRESET)), { recursive: true });
      writeFileSync(path.join(root, 'app/node_modules/@preset/base/package.json'), '{ "name": "@preset/base" }');
      writeFileSync(path.join(root, 'app/tsconfig.json'), JSON.stringify({ extends: '@preset/base/tsconfig.json', compilerOptions: own }));
      for (const [name, code] of Object.entries(forms)) {
        if (!isTypeScriptFile(ext) && (name === 'importEquals' || name === 'importType')) continue;
        const where = `${requireFirst ? 'require first' : 'import first'}, own ${JSON.stringify(own)}, ${name} in .${ext}${packageType === undefined ? '' : ` (type ${packageType})`}`;
        const answers = new Set();
        let unseen;
        for (const preset of presets) {
          writeFileSync(path.join(root, PRESET), JSON.stringify({ compilerOptions: preset }));
          const compiler = compilerTargetThroughConfig(root, ext, code);
          if (compiler === undefined) continue;
          compared++;
          answers.add(compiler);
          const seen = await runesTargetThroughConfig(root, ext, code, true);
          if (seen !== compiler) mismatches.push(`preset ${JSON.stringify(preset)} read, ${where}: compiler ${compiler}, Runes ${seen}`);
          unseen ??= { value: await runesTargetThroughConfig(root, ext, code, false) };
        }
        if (unseen === undefined) continue;
        const first = requireFirst ? 'cjs.d.ts' : 'esm.d.ts';
        if (fixedByKindOrForm(ext, name)) {
          fixed++;
          // Every preset gives the compiler one answer here, and Runes gives it without reading the preset.
          if (answers.size !== 1 || !answers.has(unseen.value)) mismatches.push(`preset not read, ${where}: compiler ${[...answers].join(' or ')}, Runes ${unseen.value}`);
        } else if (answers.size === 1 ? unseen.value !== first && !answers.has(unseen.value) : unseen.value !== first) {
          // The answer depends on the preset (or Runes cannot know that it does not): the reading from before conditions were read.
          mismatches.push(`preset not read, ${where}: the first listed target is ${first}, Runes ${unseen.value}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
    // 2 orders x 8 own option sets x 24 rows that the file kind or the call form fixes.
    expect(fixed).toBe(384);
    expect(compared).toBeGreaterThanOrEqual(10000);
  });
});
