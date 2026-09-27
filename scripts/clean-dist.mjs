// Removes dist/ before a build, so a file whose source was deleted cannot survive in the committed output.
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

rmSync(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true });
