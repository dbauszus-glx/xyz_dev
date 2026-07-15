/**
## /workspace/cacheRemoteSources

Build-time utility which copies remote source responses into the local file
system and rewrites their references to file sources.

@module /workspace/cacheRemoteSources
*/

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import envReplace from '../utils/envReplace.js';
import { getSource } from './srcMap.js';

/**
@function cacheRemoteSources
@async

@description
Recursively discovers non-file src properties in a workspace and in fetched
responses. Each unique remote source is fetched once, written as a static asset,
and replaced with a file source. Existing file sources are already static and
are left unchanged.

@param {Object} workspace Workspace to localize.
@param {String} directory Output directory for static source assets.
@returns {Promise<Object|Error>} Updated workspace or source caching Error.
*/
export default async function cacheRemoteSources(workspace, directory) {
  directory = resolve(directory);

  const cachedSources = new Map();
  const inspectedObjects = new WeakSet();
  const errors = [];
  let queue = [workspace];

  while (queue.length) {
    const sourceRefs = new Map();

    queue.forEach((value) =>
      collectRemoteSourceRefs(value, sourceRefs, inspectedObjects),
    );

    const pendingSources = [];

    for (const [src, refs] of sourceRefs) {
      const cachedSource = cachedSources.get(src);

      if (cachedSource) {
        refs.forEach((ref) => {
          ref.src = cachedSource.fileSrc;
        });
        continue;
      }

      const pendingSource = {
        refs,
        responsePromise: getSource(workspace, src),
        src,
      };

      cachedSources.set(src, pendingSource);
      pendingSources.push(pendingSource);
    }

    queue = [];

    // Every fetch in this breadth is already in the runtime source map. Awaiting
    // one at a time here does not serialize the provider requests.
    for (const source of pendingSources) {
      const response = await source.responsePromise;

      if (response instanceof Error) {
        errors.push(`${source.src}: ${response.message}`);
        continue;
      }

      source.response = response;
      source.filePath = staticFilePath(directory, source.src, response);
      source.fileSrc = fileReference(source.filePath);
      source.refs.forEach((ref) => {
        ref.src = source.fileSrc;
      });

      queue.push(response);
    }
  }

  if (errors.length) return new Error(errors.join('\n'));
  if (!cachedSources.size) return workspace;

  await mkdir(directory, { recursive: true });

  await Promise.all(
    Array.from(cachedSources.values()).map((source) =>
      writeFile(source.filePath, serializeResponse(source.response)),
    ),
  );

  return workspace;
}

function collectRemoteSourceRefs(value, sourceRefs, inspectedObjects) {
  if (!value || typeof value !== 'object') return;
  if (inspectedObjects.has(value)) return;
  inspectedObjects.add(value);

  if (typeof value.src === 'string') {
    value.src = envReplace(value.src);

    if (!value.src.startsWith('file:')) {
      const refs = sourceRefs.get(value.src) || [];
      refs.push(value);
      sourceRefs.set(value.src, refs);
    }
  }

  Object.values(value).forEach((item) =>
    collectRemoteSourceRefs(item, sourceRefs, inspectedObjects),
  );
}

function staticFilePath(directory, src, response) {
  const hash = createHash('sha256').update(src).digest('hex').slice(0, 16);

  if (typeof response === 'object' && response !== null) {
    return resolve(directory, `${hash}.json`);
  }

  const sourcePath = src.slice(src.indexOf(':') + 1).split(/[?#]/)[0];
  const extension = /^\.[a-zA-Z0-9]{1,10}$/.test(extname(sourcePath))
    ? extname(sourcePath)
    : '.txt';

  return resolve(directory, `${hash}${extension}`);
}

function fileReference(filePath) {
  let path = relative(process.cwd(), filePath).split(sep).join('/');
  if (!path.startsWith('.')) path = `./${path}`;
  return `file:${path}`;
}

function serializeResponse(response) {
  return typeof response === 'object' && response !== null
    ? `${JSON.stringify(response, null, 2)}\n`
    : String(response);
}
