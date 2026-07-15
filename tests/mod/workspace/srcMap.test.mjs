import { describe, expect, it, vi } from 'vitest';
import getFrom from '../../../mod/provider/getFrom.js';
import {
  cacheWorkspaceSources,
  getSource,
  getSrcMap,
} from '../../../mod/workspace/srcMap.js';

describe('workspace srcMap', () => {
  it('shares one promise between concurrent source requests', async () => {
    const workspace = {};
    const src = 'file:./shared.json';
    const originalFile = getFrom.file;

    getFrom.file = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { nested: { value: true } };
    });

    try {
      const [first, second] = await Promise.all([
        getSource(workspace, src),
        getSource(workspace, src),
      ]);

      first.nested.value = false;

      expect(second).toEqual({ nested: { value: true } });
      expect(getFrom.file).toHaveBeenCalledTimes(1);
      expect(getSrcMap(workspace).get(src)).toBeInstanceOf(Promise);
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
      expect(getSrcMap(workspace).has('file:./first.json')).toBeTruthy();
      expect(getSrcMap(workspace).has('file:./second.json')).toBeTruthy();
      expect(workspace).not.toHaveProperty('srcMap');
    } finally {
      getFrom.file = originalFile;
    }
  });
});
