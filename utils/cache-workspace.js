#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.workspace) {
  process.env.WORKSPACE = args.workspace;
}

await import('../mod/utils/processEnv.js');

if (!globalThis.xyzEnv.WORKSPACE) {
  throw new Error('WORKSPACE must be provided by env or --workspace.');
}

const [{ default: workspaceCache }, { default: cacheRemoteSources }] =
  await Promise.all([
    import('../mod/workspace/cache.js'),
    import('../mod/workspace/cacheRemoteSources.js'),
  ]);

const workspace = await workspaceCache(true);

if (workspace instanceof Error) {
  throw workspace;
}

const output = resolve(args.output || './workspace.generated.json');
const assets = resolve(
  args.assets ||
    join(dirname(output), `${basename(output, extname(output))}.assets`),
);

const cachedWorkspace = await cacheRemoteSources(workspace, assets);

if (cachedWorkspace instanceof Error) {
  throw cachedWorkspace;
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(cachedWorkspace, null, 2)}\n`);

console.log(`Generated workspace: ${output}`);

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') continue;

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--workspace') {
      args.workspace = argv[++i];
      continue;
    }

    if (arg.startsWith('--workspace=')) {
      args.workspace = arg.slice('--workspace='.length);
      continue;
    }

    if (arg === '--output') {
      args.output = argv[++i];
      continue;
    }

    if (arg.startsWith('--output=')) {
      args.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--assets') {
      args.assets = argv[++i];
      continue;
    }

    if (arg.startsWith('--assets=')) {
      args.assets = arg.slice('--assets='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node ./utils/cache-workspace.js [options]

Options:
  --workspace=<ref>  Workspace source ref. Defaults to WORKSPACE env.
  --output=<path>    Output JSON path. Defaults to workspace.generated.json.
  --assets=<path>    Static source directory. Defaults beside the output file.
  --help             Show this help.

Examples:
  node ./utils/cache-workspace.js --workspace=file:./workspace.json --output=./workspace.cached.json
  WORKSPACE=file:./workspace.json node ./utils/cache-workspace.js --output=./workspace.cached.json`);
}
