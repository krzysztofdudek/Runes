// Fails unless every compile step of package.json names the TypeScript package by its path and that compiler reports the version package.json pins. A bare `tsc` resolves through node_modules/.bin, which a bridge package carrying another TypeScript copy can take over after a clean install.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPILER_PATH = 'node_modules/typescript/bin/tsc';

export function compilerProblems(root) {
  const problems = [];
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pin = pkg.devDependencies?.typescript;
  if (typeof pin !== 'string' || !/^\d+\.\d+\.\d+$/.test(pin)) problems.push(`devDependencies.typescript must pin an exact version, not ${JSON.stringify(pin)}`);
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    const bare = command.split(COMPILER_PATH).join('').split(/[^A-Za-z0-9_-]/).find((word) => /^tsc\d*$/.test(word));
    if (bare !== undefined) problems.push(`script "${name}" runs a bare ${bare}; call it as node ${COMPILER_PATH}`);
  }
  let reported;
  try {
    reported = execFileSync(process.execPath, [path.join(root, COMPILER_PATH), '--version'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    problems.push(`${COMPILER_PATH} does not run: ${err.message.split('\n')[0]}`);
  }
  if (reported !== undefined && reported !== `Version ${pin}`) problems.push(`${COMPILER_PATH} reports "${reported}", package.json pins ${pin}`);
  return problems;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = compilerProblems(fileURLToPath(new URL('..', import.meta.url)));
  if (problems.length > 0) {
    process.stderr.write(`The compiler check failed:\n${problems.map((p) => `  ${p}\n`).join('')}`);
    process.exit(1);
  }
  process.stdout.write('The build compiler is the pinned one.\n');
}
