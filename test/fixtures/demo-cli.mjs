// The demo tool's CLI: the table parses, dispatch runs, and the one-block rule prints.
import { parseArgs, renderResult, renderFailure, emit } from '@chrisdudek/runes/cli';
import { TABLE, USAGE, dispatch } from './demo-tool.mjs';

const argv = process.argv.slice(2);
let json = argv.includes('--json');
try {
  const { command, args, flags } = parseArgs(TABLE, argv);
  json = flags.json === true;
  if (!command || flags.help) { process.stdout.write(USAGE); process.exit(command ? 0 : 1); }
  const result = await dispatch(command, args, flags, { pidFile: process.env.DEMO_PIDS });
  process.exitCode = emit(renderResult(result, { json: json || command === 'export' && !flags.out }));
} catch (e) {
  process.exitCode = emit(renderFailure('demo', e, { json }));
}
