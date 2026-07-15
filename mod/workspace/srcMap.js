/**
## /workspace/srcMap

Caches source responses by normalized src. Promises are stored before provider
requests are awaited so concurrent requests for a src share one fetch.

@module /workspace/srcMap
*/

import getFrom from '../provider/getFrom.js';
import envReplace from '../utils/envReplace.js';

const workspaceSrcMaps = new WeakMap();

/**
@function getSource
@async

@param {Object} workspace Cached workspace.
@param {String} src Source reference.
@returns {Promise<String|Object|Error>} Cloned source response.
*/
export async function getSource(workspace, src) {
  src = envReplace(src);

  const response = await getSourcePromise(workspace, src);

  if (response instanceof Error) return response;
  if (response === undefined) return new Error(`Unable to load src: ${src}`);

  return cloneSource(response);
}

/**
@function cacheWorkspaceSources
@async

@description
Discovers src properties in the workspace and in fetched responses. Every source
promise in a breadth is inserted into the source map before responses are
inspected, so duplicate and concurrent references share one request.

@param {Object} workspace Workspace to scan.
@returns {Promise<Object|Error>} Workspace or source discovery Error.
*/
export async function cacheWorkspaceSources(workspace) {
  const inspectedSrc = new Set();
  const inspectedObjects = new WeakSet();
  const errors = [];
  let queue = [workspace];

  while (queue.length) {
    const sources = new Set();

    queue.forEach((value) => collectSources(value, sources, inspectedObjects));

    const breadth = Array.from(sources).filter((src) => !inspectedSrc.has(src));

    breadth.forEach((src) => inspectedSrc.add(src));

    // Calling getSourcePromise for the whole breadth starts every new request
    // before any response is awaited.
    const responses = breadth.map((src) => [
      src,
      getSourcePromise(workspace, src),
    ]);

    queue = [];

    for (const [src, responsePromise] of responses) {
      const response = await responsePromise;

      if (response instanceof Error || response === undefined) {
        errors.push(
          `${src}: ${response?.message || `Unable to load src: ${src}`}`,
        );
        continue;
      }

      queue.push(response);
    }
  }

  if (errors.length) return new Error(errors.join('\n'));

  return workspace;
}

/**
@function getSrcMap

@param {Object} workspace Cached workspace.
@returns {Map<String, Promise>} Source promise map for the workspace.
*/
export function getSrcMap(workspace) {
  let srcMap = workspaceSrcMaps.get(workspace);

  if (!srcMap) {
    srcMap = new Map();
    workspaceSrcMaps.set(workspace, srcMap);
  }

  return srcMap;
}

function getSourcePromise(workspace, src) {
  const srcMap = getSrcMap(workspace);
  let responsePromise = srcMap.get(src);

  if (responsePromise) return responsePromise;

  const method = src.split(':')[0];

  responsePromise = Object.hasOwn(getFrom, method)
    ? Promise.resolve()
        .then(() => getFrom[method](src))
        .catch((err) => err)
    : Promise.resolve(new Error(`Unknown getFrom method: ${src}`));

  srcMap.set(src, responsePromise);

  return responsePromise;
}

function collectSources(value, sources, inspectedObjects) {
  if (!value || typeof value !== 'object') return;
  if (inspectedObjects.has(value)) return;
  inspectedObjects.add(value);

  if (typeof value.src === 'string') {
    sources.add(envReplace(value.src));
  }

  Object.values(value).forEach((item) =>
    collectSources(item, sources, inspectedObjects),
  );
}

function cloneSource(response) {
  return typeof response === 'object' && response !== null
    ? structuredClone(response)
    : response;
}
