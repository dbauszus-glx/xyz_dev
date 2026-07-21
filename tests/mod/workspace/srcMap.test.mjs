import { beforeEach, describe, expect, it, vi } from 'vitest';
import getFrom from '../../../mod/provider/getFrom.js';
import {
  cacheWorkspaceSources,
  getSource,
  srcMap,
} from '../../../mod/workspace/srcMap.js';

describe('workspace srcMap', () => {
  beforeEach(() => {
    srcMap.clear();
  });

  it('shares one promise between concurrent source requests', async () => {
    const src = 'file:./shared.json';
    const originalFile = getFrom.file;

    getFrom.file = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { nested: { value: true } };
    });

    try {
      const [first, second] = await Promise.all([
        getSource(src),
        getSource(src),
      ]);

      first.nested.value = false;

      expect(second).toEqual({ nested: { value: true } });
      expect(getFrom.file).toHaveBeenCalledTimes(1);
      expect(srcMap.get(src)).toBeInstanceOf(Promise);
    } finally {
      getFrom.file = originalFile;
    }
  });

  it('resolves environment variables once and aliases the unresolved src', async () => {
    const originalFile = getFrom.file;
    const originalSrcDir = xyzEnv.SRC_DIR;

    xyzEnv.SRC_DIR = './resolved';
    getFrom.file = vi.fn(async () => 'source');

    try {
      const first = await getSource('file:${DIR}/shared.json');
      const second = await getSource('file:./resolved/shared.json');
      const third = await getSource('file:${DIR}/shared.json');

      expect(first).toBe('source');
      expect(second).toBe('source');
      expect(third).toBe('source');
      expect(getFrom.file).toHaveBeenCalledTimes(1);
      expect(getFrom.file).toHaveBeenCalledWith('file:./resolved/shared.json');
      expect(srcMap.get('file:${DIR}/shared.json')).toBe(
        srcMap.get('file:./resolved/shared.json'),
      );
    } finally {
      getFrom.file = originalFile;
      xyzEnv.SRC_DIR = originalSrcDir;
    }
  });

  it('returns the provider error response', async () => {
    const originalFile = getFrom.file;

    getFrom.file = vi.fn(async () => {
      throw new Error('provider failed');
    });

    try {
      const response = await getSource('file:./failing.json');

      expect(response).toBeInstanceOf(Error);
      expect(response.message).toBe('provider failed');
    } finally {
      getFrom.file = originalFile;
    }
  });

  it('returns an error for an undefined source response', async () => {
    const originalFile = getFrom.file;

    getFrom.file = vi.fn(async () => undefined);

    try {
      const response = await getSource('file:./undefined.json');

      expect(response).toBeInstanceOf(Error);
      expect(response.message).toBe('Unable to load src: file:./undefined.json');
    } finally {
      getFrom.file = originalFile;
    }
  });

  it('discovers nested and duplicate sources', async () => {
    const workspace = {
      templates: {
        first: { src: 'file:./first.json' },
        duplicate: { src: 'file:./first.json' },
      },
    };
    const originalFile = getFrom.file;

    getFrom.file = vi.fn(async (ref) => {
      if (ref === 'file:./first.json') {
        return { nested: { src: 'file:./second.json' } };
      }

      return { loaded: true };
    });

    try {
      await cacheWorkspaceSources(workspace);

      expect(getFrom.file).toHaveBeenCalledTimes(2);
      expect(srcMap.has('file:./first.json')).toBeTruthy();
      expect(srcMap.has('file:./second.json')).toBeTruthy();
      expect(workspace).not.toHaveProperty('srcMap');
    } finally {
      getFrom.file = originalFile;
    }
  });
});
