// Runs the suite. The options after `npm test --` (a shard, a reporter) arrive here as arguments and go to node ahead of the file pattern, because node ignores an option written after a file name.
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), 'test/**/*.test.mjs'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
