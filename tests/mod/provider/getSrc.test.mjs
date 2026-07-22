import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAgent = new MockAgent();
setGlobalDispatcher(mockAgent);

const mockFileFn = vi.fn();
const mockCloudFrontFn = vi.fn();

vi.mock('../../../mod/sign/file.js', () => ({
  default: vi.fn(),
  file_signer: vi.fn(),
}));

vi.mock('../../../mod/provider/file.js', () => ({
  default: (...args) => mockFileFn(...args),
}));

vi.mock('../../../mod/provider/cloudfront.js', () => ({
  default: (...args) => mockCloudFrontFn(...args),
}));

const { default: getSrc } = await import('../../../mod/provider/getSrc.js');

const temporaryDirectories = [];

beforeEach(async () => {
  await getSrc({ clear: true });
  mockFileFn.mockReset();
  mockCloudFrontFn.mockReset();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('getSrc: providers', () => {
  it('https', async () => {
    const resBody = JSON.stringify(
      '{ "templates": {}, "locale": { "layers": {}, }, }',
    );

    const mockPool = mockAgent.get(new RegExp('https://geolytix.com/*'));

    mockPool.intercept({ path: '/config/workspace.json' }).reply(200, resBody);

    const url = 'https://geolytix.com/config/workspace.json';

    const results = await getSrc(url);

    expect(results).toEqual(
      '{ "templates": {}, "locale": { "layers": {}, }, }',
    );
  });

  it('file', async () => {
    const filePath = 'file:../../workspaces/workspace.json';

    const fileBody = JSON.stringify(
      '{ "templates": {}, "locale": { "layers": {}, }, }',
    );

    mockFileFn.mockImplementationOnce(() => {
      return JSON.parse(fileBody);
    });

    const results = await getSrc(filePath);

    expect(results).toEqual(
      '{ "templates": {}, "locale": { "layers": {}, }, }',
    );
  });

  it('cloudfront', async () => {
    globalThis.xyzEnv = {
      KEY_CLOUDFRONT: 'CLOUDFRONTKEY',
    };

    const cloudFrontURL =
      'cloudfront:aws.cloudfront.example/workspaces/workspace.json';

    const fileBody = JSON.stringify(
      '{ "templates": {}, "locale": { "layers": {}, }, }',
    );

    mockCloudFrontFn.mockImplementationOnce(() => {
      return JSON.parse(fileBody);
    });

    const results = await getSrc(cloudFrontURL);

    expect(results).toEqual(
      '{ "templates": {}, "locale": { "layers": {}, }, }',
    );
  });

  it('returns an error for an unknown provider', async () => {
    const response = await getSrc('foo:bar.json');

    expect(response).toBeInstanceOf(Error);
    expect(response.message).toBe('Unknown getSrc provider: foo:bar.json');
  });

  it('returns an error without a src string', async () => {
    const response = await getSrc({});

    expect(response).toBeInstanceOf(Error);
  });

  it('tests whether a provider exists for a src', async () => {
    expect(await getSrc({ src: 'file:./workspace.json', test: true })).toBe(
      true,
    );
    expect(await getSrc({ src: 'foo:bar.json', test: true })).toBe(false);
    expect(await getSrc({ src: 'plain text value', test: true })).toBe(false);
  });
});

describe('getSrc: source map', () => {
  it('shares one promise between concurrent source requests', async () => {
    const src = 'file:./shared.json';

    mockFileFn.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { nested: { value: true } };
    });

    const [first, second] = await Promise.all([getSrc(src), getSrc(src)]);

    first.nested.value = false;

    expect(second).toEqual({ nested: { value: true } });
    expect(mockFileFn).toHaveBeenCalledTimes(1);
  });

  it('resolves environment variables once and aliases the unresolved src', async () => {
    const originalSrcDir = xyzEnv.SRC_DIR;

    xyzEnv.SRC_DIR = './resolved';
    mockFileFn.mockImplementation(async () => 'source');

    try {
      const first = await getSrc('file:${DIR}/shared.json');
      const second = await getSrc('file:./resolved/shared.json');
      const third = await getSrc('file:${DIR}/shared.json');

      expect(first).toBe('source');
      expect(second).toBe('source');
      expect(third).toBe('source');
      expect(mockFileFn).toHaveBeenCalledTimes(1);
      expect(mockFileFn).toHaveBeenCalledWith('./resolved/shared.json');
    } finally {
      xyzEnv.SRC_DIR = originalSrcDir;
    }
  });

  it('returns the provider error response', async () => {
    mockFileFn.mockImplementation(async () => {
      throw new Error('provider failed');
    });

    const response = await getSrc('file:./failing.json');

    expect(response).toBeInstanceOf(Error);
    expect(response.message).toBe('provider failed');
  });

  it('returns an error for an undefined source response', async () => {
    mockFileFn.mockImplementation(async () => undefined);

    const response = await getSrc('file:./undefined.json');

    expect(response).toBeInstanceOf(Error);
    expect(response.message).toBe('Unable to load src: file:./undefined.json');
  });

  it('bypasses the source map with cache being false', async () => {
    mockFileFn.mockImplementation(async () => 'fresh');

    await getSrc({ src: 'file:./fresh.json', cache: false });
    await getSrc({ src: 'file:./fresh.json', cache: false });

    expect(mockFileFn).toHaveBeenCalledTimes(2);
  });

  it('flushes the source map with the clear param', async () => {
    mockFileFn.mockImplementation(async () => 'source');

    await getSrc('file:./flushed.json');
    await getSrc({ clear: true });
    await getSrc('file:./flushed.json');

    expect(mockFileFn).toHaveBeenCalledTimes(2);
  });
});

describe('getSrc: cache workspace sources', () => {
  it('discovers nested and duplicate sources', async () => {
    const workspace = {
      templates: {
        first: { src: 'file:./first.json' },
        duplicate: { src: 'file:./first.json' },
      },
    };

    mockFileFn.mockImplementation(async (ref) => {
      if (ref === './first.json') {
        return { nested: { src: 'file:./second.json' } };
      }

      return { loaded: true };
    });

    const result = await getSrc({ workspace });

    expect(result).toBe(workspace);
    expect(mockFileFn).toHaveBeenCalledTimes(2);

    // The workspace src references are not rewritten without a directory param.
    expect(workspace.templates.first.src).toBe('file:./first.json');
  });

  it('returns an error joining failed sources', async () => {
    const workspace = {
      templates: {
        failing: { src: 'file:./failing.json' },
      },
    };

    mockFileFn.mockImplementation(async () => {
      throw new Error('provider failed');
    });

    const result = await getSrc({ workspace });

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('file:./failing.json: provider failed');
  });
});

describe('getSrc: cache sources to directory', () => {
  it('writes all recursively discovered sources as static assets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xyz-source-cache-'));
    temporaryDirectories.push(directory);

    const firstSrc = 'https://example.com/first.json';
    const secondSrc = 'https://example.com/second.json';
    const workspace = {
      templates: {
        first: { src: firstSrc },
        duplicate: { src: firstSrc },
        local: { src: 'file:./local-template.json' },
      },
    };

    const mockPool = mockAgent.get('https://example.com');

    mockPool
      .intercept({ path: '/first.json' })
      .reply(200, { nested: { src: secondSrc } });
    mockPool.intercept({ path: '/second.json' }).reply(200, {
      query: 'SELECT 1',
    });

    mockFileFn.mockImplementation(async () => ({ local: true }));

    const result = await getSrc({ workspace, directory });

    expect(result).toBe(workspace);
    expect(workspace.templates.first.src).toMatch(/^file:/);
    expect(workspace.templates.duplicate.src).toBe(
      workspace.templates.first.src,
    );

    // File sources are inspected for nested sources but are left unchanged without one.
    expect(workspace.templates.local.src).toBe('file:./local-template.json');
    expect(mockFileFn).toHaveBeenCalledTimes(1);
    expect(mockFileFn).toHaveBeenCalledWith('./local-template.json');

    const firstResponse = JSON.parse(
      await readFile(filePath(workspace.templates.first.src), 'utf8'),
    );
    expect(firstResponse.nested.src).toMatch(/^file:/);

    const secondResponse = JSON.parse(
      await readFile(filePath(firstResponse.nested.src), 'utf8'),
    );
    expect(secondResponse).toEqual({ query: 'SELECT 1' });
  });

  it('inspects file sources without re-caching them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xyz-source-cache-'));
    temporaryDirectories.push(directory);

    const staticSrc = `file:${join(directory, 'static.json')}`;

    const workspace = {
      templates: {
        static: { src: staticSrc },
      },
    };

    mockFileFn.mockImplementation(async () => ({ local: true }));

    const result = await getSrc({ workspace, directory });

    expect(result).toBe(workspace);
    expect(workspace.templates.static.src).toBe(staticSrc);
    expect(mockFileFn).toHaveBeenCalledTimes(1);
  });

  it('materializes a file source whose response contains a remote source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xyz-source-cache-'));
    temporaryDirectories.push(directory);

    const workspace = {
      templates: {
        mid: { src: 'file:./mid.json' },
      },
    };

    mockFileFn.mockImplementation(async () => ({
      nested: { src: 'https://example.com/deep.json' },
    }));

    const mockPool = mockAgent.get('https://example.com');

    mockPool.intercept({ path: '/deep.json' }).reply(200, {
      query: 'SELECT deep',
    });

    const result = await getSrc({ workspace, directory });

    expect(result).toBe(workspace);

    // The file source response no longer matches the file on disk and must be written as a static asset.
    expect(workspace.templates.mid.src).not.toBe('file:./mid.json');
    expect(workspace.templates.mid.src).toMatch(/^file:/);

    const midResponse = JSON.parse(
      await readFile(filePath(workspace.templates.mid.src), 'utf8'),
    );

    expect(midResponse.nested.src).toMatch(/^file:/);
    expect(midResponse.nested.src).not.toBe('https://example.com/deep.json');

    const deepResponse = JSON.parse(
      await readFile(filePath(midResponse.nested.src), 'utf8'),
    );

    expect(deepResponse).toEqual({ query: 'SELECT deep' });
  });

  it('materializes a chain of file sources nesting a remote source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xyz-source-cache-'));
    temporaryDirectories.push(directory);

    const workspace = {
      templates: {
        outer: { src: 'file:./outer.json' },
      },
    };

    mockFileFn.mockImplementation(async (src) => {
      if (src === './outer.json') {
        return { inner: { src: 'file:./inner.json' } };
      }

      return { remote: { src: 'https://example.com/deepest.json' } };
    });

    const mockPool = mockAgent.get('https://example.com');

    mockPool.intercept({ path: '/deepest.json' }).reply(200, {
      query: 'SELECT deepest',
    });

    const result = await getSrc({ workspace, directory });

    expect(result).toBe(workspace);

    // The materialization must propagate up the chain of file sources.
    expect(workspace.templates.outer.src).not.toBe('file:./outer.json');

    const outerResponse = JSON.parse(
      await readFile(filePath(workspace.templates.outer.src), 'utf8'),
    );

    expect(outerResponse.inner.src).not.toBe('file:./inner.json');

    const innerResponse = JSON.parse(
      await readFile(filePath(outerResponse.inner.src), 'utf8'),
    );

    expect(innerResponse.remote.src).toMatch(/^file:/);

    const deepestResponse = JSON.parse(
      await readFile(filePath(innerResponse.remote.src), 'utf8'),
    );

    expect(deepestResponse).toEqual({ query: 'SELECT deepest' });
  });

  it('rewrites circular remote references without fetching twice', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xyz-source-cache-'));
    temporaryDirectories.push(directory);

    const firstSrc = 'https://example.com/circular-first.json';
    const secondSrc = 'https://example.com/circular-second.json';
    const workspace = { template: { src: firstSrc } };

    const mockPool = mockAgent.get('https://example.com');

    mockPool
      .intercept({ path: '/circular-first.json' })
      .reply(200, { nested: { src: secondSrc } });
    mockPool
      .intercept({ path: '/circular-second.json' })
      .reply(200, { nested: { src: firstSrc } });

    const result = await getSrc({ workspace, directory });

    expect(result).toBe(workspace);

    const firstResponse = JSON.parse(
      await readFile(filePath(workspace.template.src), 'utf8'),
    );
    const secondResponse = JSON.parse(
      await readFile(filePath(firstResponse.nested.src), 'utf8'),
    );

    expect(secondResponse.nested.src).toBe(workspace.template.src);
  });
});

function filePath(src) {
  return resolve(src.slice('file:'.length));
}
