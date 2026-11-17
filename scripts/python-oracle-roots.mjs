// The directories the corpus's Python oracle searches an absolute import from, besides the importing file's own ancestors: each directory that holds a project manifest, its src/, and the source roots its pyproject.toml or setup.cfg names, read by Python's own tomllib and configparser, so the oracle does not share the reader it checks. Nothing here ships and nothing here runs inside npm test but its own test.
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const PYTHON_MANIFESTS = new Set(['pyproject.toml', 'setup.cfg', 'setup.py']);

// Each manifest's named roots, relative to its directory, as each build backend reads its own keys; a manifest Python cannot parse names none.
const PYTHON_ROOTS = `
import configparser, json, os, sys, tomllib
def get(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d
def strings(v):
    return [x for x in v if isinstance(x, str)] if isinstance(v, list) else []
def pyproject(p):
    with open(p, 'rb') as f:
        tool = get(tomllib.load(f), 'tool')
    roots = strings(get(tool, 'setuptools', 'packages', 'find', 'where'))
    package_dir = get(tool, 'setuptools', 'package-dir')
    if isinstance(package_dir, dict) and isinstance(package_dir.get(''), str):
        roots.append(package_dir[''])
    packages = get(tool, 'poetry', 'packages')
    for e in packages if isinstance(packages, list) else []:
        if isinstance(e, dict) and 'to' not in e and isinstance(e.get('from', '.'), str):
            roots.append(e.get('from', '.'))
    roots += [os.path.dirname(x.rstrip('/')) or '.' for x in strings(get(tool, 'hatch', 'build', 'targets', 'wheel', 'packages'))]
    # hatchling reads the wheel target's sources alone whenever the target sets them.
    wheel = get(tool, 'hatch', 'build', 'targets', 'wheel')
    sources = wheel['sources'] if isinstance(wheel, dict) and 'sources' in wheel else get(tool, 'hatch', 'build', 'sources')
    roots += strings(sources)
    if isinstance(sources, dict):
        roots += [k for k, v in sources.items() if v == '']
    for v in (get(tool, 'maturin', 'python-source'), get(tool, 'pdm', 'build', 'package-dir')):
        if isinstance(v, str):
            roots.append(v)
    return roots
def items(value):
    return [x.strip() for x in (value.split('\\n') if '\\n' in value.strip() else value.split(',')) if x.strip()]
def setup_cfg(p):
    cp = configparser.ConfigParser(interpolation=None)
    cp.optionxform = str
    cp.read(p, encoding='utf-8')
    roots = []
    if cp.has_option('options', 'package_dir'):
        for item in items(cp.get('options', 'package_dir')):
            key, eq, value = item.partition('=')
            if eq and key.strip() == '':
                roots.append(value.strip())
    if cp.has_option('options.packages.find', 'where'):
        roots += items(cp.get('options.packages.find', 'where'))[:1]
    return roots
out = []
for name, p in json.load(sys.stdin):
    try:
        out.append(pyproject(p) if name == 'pyproject.toml' else setup_cfg(p))
    except Exception:
        out.append([])
json.dump(out, sys.stdout)
`;

const dirOf = (file) => {
  const d = path.posix.dirname(file);
  return d === '.' ? '' : d;
};

/** The roots, repo-relative POSIX ('' for the repository root) and sorted, of the repository at `repoDir` whose tracked files are `files`. A named root counts when it is a directory of the repository and stays inside its manifest's directory. `python` is the interpreter that reads the manifests. */
export function pythonOracleRoots(repoDir, files, python = 'python3') {
  const dirs = new Set(files.map(dirOf));
  const isDir = (d) => dirs.has(d) || [...dirs].some((x) => x.startsWith(`${d}/`));
  const roots = new Set();
  const read = [];
  for (const f of files) {
    const name = path.posix.basename(f);
    if (!PYTHON_MANIFESTS.has(name)) continue;
    const d = dirOf(f);
    roots.add(d);
    const src = d === '' ? 'src' : `${d}/src`;
    if (isDir(src)) roots.add(src);
    if (name !== 'setup.py') read.push([name, f]);
  }
  if (read.length > 0) {
    const run = spawnSync(python, ['-I', '-c', PYTHON_ROOTS], { input: JSON.stringify(read.map(([name, f]) => [name, path.join(repoDir, f)])), encoding: 'utf8', maxBuffer: 1 << 30, cwd: os.tmpdir() });
    if (run.error || run.status !== 0) throw new Error(`the Python oracle could not read the manifests: ${run.error?.message ?? run.stderr}`);
    JSON.parse(run.stdout).forEach((named, i) => {
      const d = dirOf(read[i][1]);
      for (const root of named) {
        if (root.includes('\\') || path.posix.isAbsolute(root)) continue;
        const rel = path.posix.normalize(root).replace(/\/+$/, '');
        if (rel === '..' || rel.startsWith('../')) continue;
        const joined = rel === '.' || rel === '' ? d : d === '' ? rel : `${d}/${rel}`;
        if (joined === d || isDir(joined)) roots.add(joined);
      }
    });
  }
  return [...roots].sort();
}
