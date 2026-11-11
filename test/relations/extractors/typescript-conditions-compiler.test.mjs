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

const SETTINGS = [
  { module: 'nodenext', moduleResolution: 'nodenext' },
  { module: 'node16' },
  { module: 'esnext', moduleResolution: 'bundler' },
  { module: 'commonjs', moduleResolution: 'bundler' },
  { module: 'amd', moduleResolution: 'bundler' },
  { module: 'preserve' },
];
const FORMS = {
  static: { code: "import { v } from 'lib';\nexport const x = v;", types: false },
  dynamic: { code: "export const x = import('lib');", types: false },
  require: { code: "const m = require('lib');\nexport const x = m;", types: false },
  importEquals: { code: "import m = require('lib');\nexport const x = m;", types: true },
  typeofImport: { code: "export type T = typeof import('lib');", types: true },
  importType: { code: "export let v: import('lib').T;", types: true },
};
const EXTENSIONS = ['ts', 'cts', 'mts', 'js', 'cjs', 'mjs'];
const isTypeScriptFile = (ext) => ext === 'ts' || ext === 'cts' || ext === 'mts';
const PACKAGE_TYPES = [undefined, 'module'];

function fixture(ext, code, packageType) {
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
  put(`app/use.${ext}`, code);
  return root;
}

function compilerTarget(root, ext, setting) {
  const options = ts.convertCompilerOptionsFromJson({ ...setting, allowJs: true, noEmit: true, noLib: true, skipLibCheck: true, types: [], target: 'esnext' }, root).options;
  const file = path.join(root, `app/use.${ext}`);
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
  const language = ext === 'js' || ext === 'cjs' || ext === 'mjs' ? 'javascript' : 'typescript';
  const { uses } = await runExtractor(typescriptExtractor, language, `.${ext}`, code);
  const hint = uses[0].candidates[0];
  const isFile = (p) => {
    try {
      return statSync(path.join(root, p)).isFile();
    } catch {
      return false;
    }
  };
  const target = resolveTsPath(hint.specifier, `app/use.${ext}`, isFile, makeTsResolveDeps(root), hint.callForm);
  return target === undefined ? undefined : path.basename(target);
}

describe('the conditions Runes enters are the ones the compiler enters', () => {
  for (const setting of SETTINGS) {
    it(`${JSON.stringify(setting)}`, async () => {
      const mismatches = [];
      let compared = 0;
      for (const ext of EXTENSIONS) for (const packageType of PACKAGE_TYPES) for (const [name, form] of Object.entries(FORMS)) {
        if (form.types && !isTypeScriptFile(ext) && name !== 'importEquals') continue;
        if (name === 'importEquals' && !isTypeScriptFile(ext)) continue;
        const root = fixture(ext, form.code, packageType);
        const compiler = compilerTarget(root, ext, setting);
        if (compiler === undefined) continue;
        compared++;
        const runes = await runesTarget(root, ext, form.code, setting);
        if (runes !== compiler) mismatches.push(`${name} in .${ext}${packageType === undefined ? '' : ` (type ${packageType})`}: compiler ${compiler}, Runes ${runes}`);
      }
      expect(compared).toBeGreaterThan(20);
      expect(mismatches).toEqual([]);
    });
  }
});
