// dist/ is committed because consumers vendor it from a clone. This rebuilds it and fails when the rebuilt tree differs from what git holds: a changed, deleted or new file under dist/ means the commit carries stale output.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' });
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'dist'], { cwd: root, encoding: 'utf8' });
if (status.trim() !== '') {
  process.stderr.write(`dist/ is stale: rebuild and commit it.\n${status}`);
  execFileSync('git', ['--no-pager', 'diff', '--stat', '--', 'dist'], { cwd: root, stdio: 'inherit' });
  process.exit(1);
}
process.stdout.write('dist/ is fresh.\n');
