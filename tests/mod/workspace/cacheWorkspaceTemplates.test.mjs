import { beforeEach, describe, expect, it } from 'vitest';
import { cacheWorkspaceTemplates } from '../../../mod/workspace/_workspace.js';
import checkWorkspaceCache from '../../../mod/workspace/cache.js';

describe('cacheWorkspaceTemplates', () => {
  beforeEach(async () => {
    globalThis.xyzEnv = {
      TITLE: 'WORKSPACE CACHE SOURCES TEST',
      WORKSPACE: 'file:./tests/assets/workspace_cache_sources.json',
    };

    await checkWorkspaceCache(true);
  });

  it('caches repeated and nested src templates', async () => {
    const workspace = await cacheWorkspaceTemplates({ force: true });

    expect(workspace.templates.shared_layer.src).toBeUndefined();
    expect(workspace.templates.same_shared_layer.src).toBeUndefined();
    expect(workspace.templates.shared_layer.format).toEqual('geojson');
    expect(workspace.templates.same_shared_layer.format).toEqual('geojson');
    expect(workspace.templates.shared_layer.nested.src).toBeUndefined();
    expect(workspace.templates.shared_layer.nested.query.template).toEqual(
      'SELECT * FROM test;\n',
    );
  });

  it('caches src values added by fetched templates', async () => {
    const workspace = await cacheWorkspaceTemplates({ force: true });

    expect(workspace.templates.remote_locale.src).toBeUndefined();
    const nestedTemplate =
      workspace.templates.remote_locale.layers.Nested.template;

    expect(nestedTemplate.src).toBeUndefined();
    expect(nestedTemplate.query.template).toEqual('SELECT * FROM test;\n');
  });

  it('does not expand recursive src references indefinitely', async () => {
    const workspace = await cacheWorkspaceTemplates({ force: true });

    expect(workspace.templates.recursive_template.src).toBeUndefined();
    expect(workspace.templates.recursive_template.template.src).toEqual(
      'file:./tests/assets/cache_sources/recursive_template.json',
    );
  });

  it('leaves module template src for runtime imports', async () => {
    const workspace = await cacheWorkspaceTemplates({ force: true });

    expect(workspace.templates.module_query.src).toEqual(
      'file:./tests/assets/queries/mod_query.js',
    );
  });
});
