// The directories the corpus's Python oracle searches an absolute import from, besides the importing file's own ancestors: each directory that holds a project manifest, and its src/. Nothing here ships and nothing here runs inside npm test but its own test.
import path from 'node:path';

const PYTHON_MANIFESTS = new Set(['pyproject.toml', 'setup.cfg', 'setup.py']);

const dirOf = (file) => {
  const d = path.posix.dirname(file);
  return d === '.' ? '' : d;
};

/** The roots, repo-relative POSIX ('' for the repository root) and sorted, of the repository at `repoDir` whose tracked files are `files`. */
export function pythonOracleRoots(repoDir, files) {
  const dirs = new Set(files.map(dirOf));
  const roots = new Set();
  for (const f of files) {
    if (!PYTHON_MANIFESTS.has(path.posix.basename(f))) continue;
    const d = dirOf(f);
    roots.add(d);
    const src = d === '' ? 'src' : `${d}/src`;
    if (dirs.has(src) || [...dirs].some((x) => x.startsWith(`${src}/`))) roots.add(src);
  }
  return [...roots].sort();
}
