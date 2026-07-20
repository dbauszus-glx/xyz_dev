/**
## /workspace/srcMap

Caches source responses by normalized src. Promises are stored before provider
requests are awaited so concurrent requests for a src share one fetch.

@module /workspace/srcMap
*/

import getFrom from '../provider/getFrom.js';
import envReplace from '../utils/envReplace.js';

/**
Module scope source promise map. The map must be cleared when the workspace cache is rebuilt.
*/
export const srcMap = new Map();

/**
@function getSource
@async
@description
TODO

@param {String} src Source reference.
@returns {Promise<String|Object|Error>} Cloned source response.
*/
export async function getSource(src) {
  src = envReplace(src);

  const response = await getSourcePromise(src);

  if (response instanceof Error) {
    // TODO needs test
    return response;
  }
  if (response === undefined) {
    // TODO needs test
    return new Error(`Unable to load src: ${src}`);
  }

  return cloneSource(response);
}

/**
@function cacheWorkspaceSources
@async

@description
Discovers src properties in the workspace and in fetched responses. Every source promise in a breadth is inserted into the source map before responses are inspected, so duplicate and concurrent references share one request.

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

    // Calling getSourcePromise for the whole breadth starts every new request before any response is awaited.
    const responses = breadth.map((src) => [src, getSourcePromise(src)]);

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
@function getSourcePromise
@description
Retrieves the source promise for the given src. If the source promise does not exist, it is created using the appropriate method from the getFrom object.

@param {String} src Source identifier.
@returns {Promise<Object|Error>} Source response promise.
*/
function getSourcePromise(src) {
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

/**
@function collectSources
@description
Recursively collects src properties from the value object and adds them to the sources Set. Inspected objects are tracked in the inspectedObjects WeakSet to avoid infinite recursion.

@param {Object} obj
@param {Set} sources 
@param {WeakSet} inspectedObjects 
@returns {void}
*/
function collectSources(obj, sources, inspectedObjects) {
  if (!obj || typeof obj !== 'object') return;
  if (inspectedObjects.has(obj)) return;
  inspectedObjects.add(obj);

  if (typeof obj.src === 'string') {
    sources.add(envReplace(obj.src));
  }

  Object.values(obj).forEach((item) =>
    collectSources(item, sources, inspectedObjects),
  );
}

function cloneSource(response) {
  return typeof response === 'object' && response !== null
    ? structuredClone(response)
    : response;
}
