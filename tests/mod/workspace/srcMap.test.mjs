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
