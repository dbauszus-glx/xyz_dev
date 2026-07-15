import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import getFrom from '../../../mod/provider/getFrom.js';
import cacheRemoteSources from '../../../mod/workspace/cacheRemoteSources.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('cacheRemoteSources', () => {
  it('writes recursively discovered remote sources as static assets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xyz-source-cache-'));
    temporaryDirectories.push(directory);

    const firstSrc = 'https://example.com/first.json';
    const secondSrc = 'https://example.com/second.json';
    const workspace = {
      templates: {
        first: { src: firstSrc },
        duplicate: { src: firstSrc },
        local: { src: 'file:./already-static.json' },
      },
    };
    const originalHttps = getFrom.https;

    getFrom.https = vi.fn(async (src) => {
      if (src === firstSrc) return { nested: { src: secondSrc } };
      return { query: 'SELECT 1' };
    });

    try {
      const result = await cacheRemoteSources(workspace, directory);

      expect(result).toBe(workspace);
      expect(getFrom.https).toHaveBeenCalledTimes(2);
      expect(workspace.templates.first.src).toMatch(/^file:/);
      expect(workspace.templates.duplicate.src).toBe(
        workspace.templates.first.src,
      );
      expect(workspace.templates.local.src).toBe('file:./already-static.json');

      const firstResponse = JSON.parse(
        await readFile(filePath(workspace.templates.first.src), 'utf8'),
      );
      expect(firstResponse.nested.src).toMatch(/^file:/);

      const secondResponse = JSON.parse(
        await readFile(filePath(firstResponse.nested.src), 'utf8'),
      );
      expect(secondResponse).toEqual({ query: 'SELECT 1' });
    } finally {
      getFrom.https = originalHttps;
    }
  });

  it('rewrites circular remote references without fetching twice', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xyz-source-cache-'));
    temporaryDirectories.push(directory);

    const firstSrc = 'https://example.com/first.json';
    const secondSrc = 'https://example.com/second.json';
    const workspace = { template: { src: firstSrc } };
    const originalHttps = getFrom.https;

    getFrom.https = vi.fn(async (src) => ({
      nested: { src: src === firstSrc ? secondSrc : firstSrc },
    }));

    try {
      await cacheRemoteSources(workspace, directory);

      const firstResponse = JSON.parse(
        await readFile(filePath(workspace.template.src), 'utf8'),
      );
      const secondResponse = JSON.parse(
        await readFile(filePath(firstResponse.nested.src), 'utf8'),
      );

      expect(secondResponse.nested.src).toBe(workspace.template.src);
      expect(getFrom.https).toHaveBeenCalledTimes(2);
    } finally {
      getFrom.https = originalHttps;
    }
  });
});

function filePath(src) {
  return resolve(src.slice('file:'.length));
}
