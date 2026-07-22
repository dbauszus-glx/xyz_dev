/**
## /provider/getSrc

The getSrc module resolves src references through a provider determined from the src prefix, eg. `file:`, `https:`, `cloudfront:`, or a signer provider from a SIGN_* xyzEnv key.

All source responses are cached in a module scope source map regardless of their provider. Promises are stored in the map before provider requests are awaited so concurrent requests for the same src share one request. The source map must be cleared when the workspace cache is rebuilt.

The module has a single getSrc export. The params determine the behaviour:

- A src string or `{src}` params object resolves a single source response from the source map.
- `{src, cache: false}` bypasses the source map for a fresh provider response, eg. a workspace rebuild.
- `{src, test: true}` checks whether a provider exists for the src reference.
- `{clear: true}` flushes the source map.
- `{workspace}` recursively discovers and caches every source in the workspace.
- `{workspace, directory}` additionally writes every source response as a static asset and rewrites the src references to file sources. File sources are already local and are left unchanged unless their response nests a rewritten source reference.

@requires /sign/file
@requires /utils/envReplace
@requires /utils/logger
@requires /provider/cloudfront
@requires /provider/file

@module /provider/getSrc
*/

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import file_signer from '../sign/file.js';
import envReplace from '../utils/envReplace.js';
import logger from '../utils/logger.js';
import cloudfront from './cloudfront.js';
import file from './file.js';

const providers = {
  cloudfront: Cloudfront,
  file: File,
  https: Https,
};

// Assign XYZ signer provider for each SIGN_* key in xyzEnv.
for (const key in xyzEnv) {
  const PROVIDER = new RegExp(/^SIGN_(.*)/).exec(key)?.[1];
  if (PROVIDER === undefined) continue;
  providers[PROVIDER] = XYZ;
}

/**
Module scope source promise map. The map must be cleared when the workspace cache is rebuilt.
*/
const srcMap = new Map();

/**
@function getSrc
@async

@description
The getSrc method resolves a src reference to its source response. The provider for the request is determined from the resolved src prefix.

Errors are returned rather than thrown. Object responses are cloned to prevent modification of the cached response.

The behaviour of the method is determined by the params. A string param is shorthand for a params object with a src property.

@param {String|Object} params A src reference string or params object.
@property {String} [params.src] Source reference.
@property {Boolean} [params.cache] The source map is bypassed for a fresh provider response with cache being false.
@property {Boolean} [params.test] Returns whether a provider exists for the src reference.
@property {Boolean} [params.clear] Flushes the source map.
@property {Object} [params.workspace] Workspace to recursively discover and cache sources in.
@property {String} [params.directory] Output directory for static source assets. Requires the workspace param.

@returns {Promise<String|Object|Error>} Cloned source response.
*/
export default async function getSrc(params) {
  if (typeof params === 'string') params = { src: params };

  if (params?.clear) {
    srcMap.clear();
    return;
  }

  if (params?.workspace) {
    return cacheSources(params);
  }

  if (typeof params?.src !== 'string') {
    return new Error('A src string is required to get a source.');
  }

  if (params.test) {
    return Object.hasOwn(providers, envReplace(params.src).split(':')[0]);
  }

  if (params.cache === false) {
    // A fresh provider response is required, eg. for a workspace rebuild.
    return providerPromise(envReplace(params.src));
  }

  const response = await getSrcPromise(params.src);

  if (response instanceof Error) {
    return response;
  }
  if (response === undefined) {
    return new Error(`Unable to load src: ${params.src}`);
  }

  return cloneSource(response);
}

/**
@function getSrcPromise
@description
Retrieves the source promise for the given src. If the source promise does not exist, it is created with the provider determined from the resolved src prefix.

Environment variables in the src are only substituted on a map miss. A src with environment variables is stored as an alias for the resolved src promise so envReplace runs once per unique src string.

@param {String} src Source identifier.
@returns {Promise<Object|Error>} Source response promise.
*/
function getSrcPromise(src) {
  let responsePromise = srcMap.get(src);

  if (responsePromise) return responsePromise;

  const resolvedSrc = envReplace(src);

  responsePromise = srcMap.get(resolvedSrc);

  if (!responsePromise) {
    responsePromise = providerPromise(resolvedSrc);

    srcMap.set(resolvedSrc, responsePromise);
  }

  // Alias the unresolved src so subsequent requests hit the map without envReplace.
  if (src !== resolvedSrc) srcMap.set(src, responsePromise);

  return responsePromise;
}

/**
@function providerPromise
@description
Creates a provider request promise for a resolved src. Provider errors are resolved rather than thrown.

@param {String} resolvedSrc Resolved source reference.
@returns {Promise<String|Object|Error>} Provider response promise.
*/
function providerPromise(resolvedSrc) {
  const method = resolvedSrc.split(':')[0];

  if (!Object.hasOwn(providers, method)) {
    return Promise.resolve(
      new Error(`Unknown getSrc provider: ${resolvedSrc}`),
    );
  }

  return Promise.resolve()
    .then(() => providers[method](resolvedSrc))
    .catch((err) => err);
}

/**
@function cacheSources
@async

@description
Recursively discovers src properties in a workspace and in fetched responses. Every source promise in a breadth is inserted into the source map before responses are inspected, so duplicate and concurrent references share one request.

All sources are fetched and inspected regardless of their provider. Sources nested in a source response, eg. a template src in a template, are discovered by inspecting the response.

With a directory param each unique remote source response is written as a static asset and the src references are rewritten to file sources. File sources are already local and are left unchanged unless their response contains a rewritten source reference. Such a file source response no longer matches the file on disk and is itself written as a static asset.

@param {Object} params
@property {Object} params.workspace Workspace to scan.
@property {String} [params.directory] Output directory for static source assets.
@returns {Promise<Object|Error>} Workspace or source discovery Error.
*/
async function cacheSources(params) {
  const directory = params.directory && resolve(params.directory);

  const cachedSources = new Map();
  const inspectedObjects = new WeakSet();
  const errors = [];
  let queue = [{ owner: null, value: params.workspace }];

  while (queue.length) {
    const sourceRefs = new Map();

    queue.forEach(({ owner, value }) =>
      collectSourceRefs(value, owner, sourceRefs, inspectedObjects, directory),
    );

    const pendingSources = registerSources(
      sourceRefs,
      cachedSources,
      directory,
    );

    queue = [];

    // Every request in this breadth is already in the source map. Awaiting one at a time here does not serialize the provider requests.
    for (const source of pendingSources) {
      let response = await source.responsePromise;

      if (response instanceof Error || response === undefined) {
        errors.push(
          `${source.src}: ${response?.message || `Unable to load src: ${source.src}`}`,
        );
        continue;
      }

      if (directory) {
        // The response is cloned to prevent src rewrites modifying the cached response.
        response = cloneSource(response);
        source.response = response;

        // Remote sources are always written as static assets. File sources are only materialized when their response contains a rewritten source reference.
        if (!source.fileSource) materializeSource(source, directory);
      }

      queue.push({ owner: source, value: response });
    }
  }

  if (errors.length) return new Error(errors.join('\n'));

  if (directory && cachedSources.size) {
    await mkdir(directory, { recursive: true });

    await Promise.all(
      Array.from(cachedSources.values())
        .filter((source) => source.filePath)
        .map((source) =>
          writeFile(source.filePath, serializeResponse(source.response)),
        ),
    );
  }

  return params.workspace;
}

/**
@function registerSources
@description
Registers the source references of a discovery breadth against the cachedSources Map. A pending source with its response promise is created for each src not yet cached.

References to an already materialized source are rewritten. References to a source not yet materialized are retained should the source be materialized later.

@param {Map} sourceRefs Source references collected in the discovery breadth.
@param {Map} cachedSources Sources cached in the discovery.
@param {String} [directory] Output directory for static source assets.
@returns {Array} Pending sources to be awaited.
*/
function registerSources(sourceRefs, cachedSources, directory) {
  const pendingSources = [];

  for (const [src, refs] of sourceRefs) {
    const cachedSource = cachedSources.get(src);

    if (cachedSource) {
      if (cachedSource.fileSrc) {
        // The source has been materialized. Later discovered references must be rewritten.
        rewriteRefs(cachedSource, refs, directory);
      } else {
        // The references must be retained should the source be materialized later.
        cachedSource.refs.push(...refs);
      }
      continue;
    }

    const pendingSource = {
      fileSource: src.startsWith('file:'),
      refs,
      responsePromise: getSrcPromise(src),
      src,
    };

    cachedSources.set(src, pendingSource);
    pendingSources.push(pendingSource);
  }

  return pendingSources;
}

/**
@function materializeSource
@description
Assigns a static asset file reference to a source and rewrites all its references. A file source response containing a rewritten reference no longer matches the file on disk and must be materialized itself.

@param {Object} source Source to materialize.
@param {String} directory Output directory for static source assets.
*/
function materializeSource(source, directory) {
  // The source has already been materialized.
  if (source.fileSrc) return;

  source.filePath = staticFilePath(directory, source.src, source.response);
  source.fileSrc = fileReference(source.filePath);
  rewriteRefs(source, source.refs, directory);
}

/**
@function rewriteRefs
@description
Rewrites source references to the static asset file reference of a materialized source. The owner of a rewritten reference is materialized if the owner is a file source.

@param {Object} source Materialized source.
@param {Array} refs References to rewrite.
@param {String} directory Output directory for static source assets.
*/
function rewriteRefs(source, refs, directory) {
  for (const { owner, ref } of refs) {
    ref.src = source.fileSrc;

    if (owner?.fileSource) materializeSource(owner, directory);
  }
}

/**
@function collectSourceRefs
@description
Recursively collects objects with a src property from the value object and maps them against their src in the sourceRefs Map. Inspected objects are tracked in the inspectedObjects WeakSet to avoid infinite recursion.

Each collected reference records the owner source whose response contains the reference. References in the workspace itself have no owner.

Src references are resolved in place with a directory param.

@param {Object} value
@param {Object} owner The source whose response is being inspected.
@param {Map} sourceRefs
@param {WeakSet} inspectedObjects
@param {String} [directory] Output directory for static source assets.
@returns {void}
*/
function collectSourceRefs(
  value,
  owner,
  sourceRefs,
  inspectedObjects,
  directory,
) {
  if (!value || typeof value !== 'object') return;
  if (inspectedObjects.has(value)) return;
  inspectedObjects.add(value);

  if (typeof value.src === 'string') {
    // Src references are only resolved in place when the workspace is localized.
    if (directory) value.src = envReplace(value.src);

    const refs = sourceRefs.get(value.src) || [];
    refs.push({ owner, ref: value });
    sourceRefs.set(value.src, refs);
  }

  Object.values(value).forEach((item) =>
    collectSourceRefs(item, owner, sourceRefs, inspectedObjects, directory),
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

function cloneSource(response) {
  return typeof response === 'object' && response !== null
    ? structuredClone(response)
    : response;
}

/**
@function Cloudfront
@async

@description
The method will extract a cloudfront URL from the ref param string.

The fetch request will be created from the cloudfront provider module with the cloudfront url.

@param {string} ref Cloudfront resource reference.

@returns {Promise<String|JSON|Error>} The fetch is resolved into either a string or JSON depending on the url ending.
*/
async function Cloudfront(ref) {
  if (!xyzEnv.KEY_CLOUDFRONT) {
    return console.error('Cloudfront key is missing');
  }

  const url = ref.split(':')[1];

  return await cloudfront(url);
}

function File(ref) {
  const src = ref.split(':')[1];

  return file(src);
}

async function Https(url) {
  try {
    const response = await fetch(url);

    logger(`${response.status} - ${response.url}`, 'fetch');

    if (url.match(/\.json$/i)) {
      return await response.json();
    }

    return await response.text();
  } catch (err) {
    console.error(err);
    return err;
  }
}

/**
@function XYZ
@async

@description
The method splits the reference string into a params object for the XYZ file signer.

@param {string} ref Reference for the XYZ signer.

@returns {Promise<String|JSON|Error>} The fetch is resolved into either a string or JSON depending on the url ending.
*/
async function XYZ(ref) {
  const params = {
    signing_key: ref.split(':')[0],
    url: ref.split(':')[1],
  };

  const signedUrl = file_signer({ params });

  // Different content types require different request headers. These will get assigned based on the file ending.
  const fileType = signedUrl.split('.').at(-1);
  const contentTypes = {
    json: 'application/json',
    html: 'text/html',
    js: 'text/javascript',
  };
  const contentType = contentTypes[fileType] || 'text/plain';

  const timestamp = Date.now();

  const response = await fetch(signedUrl, {
    headers: {
      'Content-Type': contentType,
    },
  });

  logger(
    `${Date.now() - timestamp}: ${response.ok} - ${params.signing_key}/${params.url}`,
    'xyzfetch',
  );

  if (!response.ok) {
    return new Error(`Failed to fetch`);
  }

  const content =
    fileType === 'json' ? await response.json() : await response.text();

  return content;
}
