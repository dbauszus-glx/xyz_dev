import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import getFrom from '../../../mod/provider/getFrom.js';
import checkWorkspaceCache from '../../../mod/workspace/cache.js';

//Assigning console.error to a property to restore original function with.
const originalConsole = console.error;

//erros from test so we can assert on them and not get polute the console.
const mockErrors = [];

beforeAll(() => {
  //Changing the console.error function to push to our local collection of messages.
  console.error = (message) => {
    mockErrors.push(message);
  };
});

afterAll(() => {
  console.error = originalConsole;
});

describe('getTemplate', async () => {
  globalThis.xyzEnv = {
    TITLE: 'TITLE',
    WORKSPACE: 'file:./tests/assets/workspace_locale_layers_templates.json',
  };

  const { default: getTemplate } = await import(
    '../../../mod/workspace/getTemplate.js'
  );

  //Calling the cache method with force to reload a new workspace
  await checkWorkspaceCache('file');

  it('get template from workspace', async () => {
    // const { default: getTemplate } = await import(
    //   '../../../mod/workspace/getTemplate.js'
    // );

    const result = await getTemplate('OSM');

    expect(typeof result === 'object').toBeTruthy();
    expect(Object.hasOwn(result, 'roles')).toBeTruthy();
  });

  it('query module has render property', async () => {
    // const { default: getTemplate } = await import(
    //   '../../../mod/workspace/getTemplate.js'
    // );

    const result = await getTemplate('mod_query');

    expect(typeof result === 'object').toBeTruthy();
    expect(Object.hasOwn(result, 'render')).toBeTruthy();
  });

  it('query module is Error', async () => {
    // const { default: getTemplate } = await import(
    //   '../../../mod/workspace/getTemplate.js'
    // );

    const result = await getTemplate('bad_mod_query');

    expect(result instanceof Error).toBeTruthy();
  });

  it('query module render string', async () => {
    // const { default: getTemplate } = await import(
    //   '../../../mod/workspace/getTemplate.js'
    // );

    const result = await getTemplate('mod_query_no_default');

    const foo = result.render.foo();

    expect(foo).toEqual('I am a module query fam');
  });

  it('templates sharing a src remain isolated', async () => {
    // const { default: getTemplate } = await import(
    //   '../../../mod/workspace/getTemplate.js'
    // );

    const fooTemplate = {
      foo: true,
      src: 'file:./tests/assets/layers/template_test/layer.json',
    };

    const fooResult = await getTemplate(fooTemplate);

    expect(fooResult.foo).toBeTruthy();
    expect(fooResult.bar).toBeFalsy();

    const barTemplate = {
      bar: true,
      src: 'file:./tests/assets/layers/template_test/layer.json',
    };

    const barResult = await getTemplate(barTemplate);

    expect(barResult.bar).toBeTruthy();
    expect(barResult.foo).toBeFalsy();
  });

  it('shares one source promise between concurrent templates', async () => {
    const src = 'file:./tests/assets/concurrent-template.json';
    const originalFile = getFrom.file;

    getFrom.file = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { format: 'geojson' };
    });

    try {
      const [foo, bar] = await Promise.all([
        getTemplate({ foo: true, src }),
        getTemplate({ bar: true, src }),
      ]);

      expect(foo).toMatchObject({ foo: true, format: 'geojson' });
      expect(bar).toMatchObject({ bar: true, format: 'geojson' });
      expect(getFrom.file).toHaveBeenCalledTimes(1);
    } finally {
      getFrom.file = originalFile;
    }
  });
});
