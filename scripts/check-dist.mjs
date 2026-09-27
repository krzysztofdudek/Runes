// dist/ is committed because consumers vendor it from a clone. This rebuilds it and fails when the rebuilt tree differs from what git holds: a changed, deleted or new file under dist/ means the commit carries stale output.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Node refuses to spawn a .cmd shim such as npm.cmd without a shell since the April 2024 security releases (EINVAL), so on Windows the rebuild goes through npm's own JS entry point, which npm puts in npm_execpath for every script it runs. Outside npm, a shell resolves the shim.
const npmCli = process.env.npm_execpath;
if (npmCli && /\.[cm]?js$/.test(npmCli)) execFileSync(process.execPath, [npmCli, 'run', 'build'], { cwd: root, stdio: 'inherit' });
else execFileSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'dist'], { cwd: root, encoding: 'utf8' });
if (status.trim() !== '') {
  process.stderr.write(`dist/ is stale: rebuild and commit it.\n${status}`);
  execFileSync('git', ['--no-pager', 'diff', '--stat', '--', 'dist'], { cwd: root, stdio: 'inherit' });
  process.exit(1);
}
process.stdout.write('dist/ is fresh.\n');
