/**
## /workspace/getTemplate
The module exports the getTemplate method which is required by the query, languageTemplates, getLayer, and getLocale modules.

@requires /workspace/cache
@requires /workspace/srcMap

@module /workspace/getTemplate
*/

import envReplace from '../utils/envReplace.js';
import workspaceCache from './cache.js';
import { getSource } from './srcMap.js';

/**
@global
@typedef {Object} template A template is an object property of the workspace.templates
@property {Object} _type The _type property distinguish the origin of a template. 'core' templates are added from the /mod/workspace/templates directory. A 'custom' is added from a custom_template JSON file defined in the xyzEnv. A 'workspace' is added from the workspace itself.
@property {String} src The source is a location from which a template object is loaded when required.
@property {String} template The string representation of a template, eg. html, sql.
@property {Function} render A method which resolves in a template string.
@property {Boolean} module The template is a module.
*/

/**
@function getTemplate
@async

@description
The workspace will be checked and cached by the [Workspace API checkWorkspaceCache]{@link module:/workspace/cache~checkWorkspaceCache} method.

The template parameter provided as a string from user input must be validated to only include whitelisted character.

A lookup for the template object in the cached workspace.templates{} will be performed.

Templates without a src property will be returned immediately.

The template src response is retrieved from the workspace source map. The first
request stores its provider promise before awaiting so concurrent requests share
one fetch.

A module template will be created from the cached source response with the template.module flag.

The source response will be composed into a clone of the template definition.
Template definitions in workspace.templates remain unchanged.

A structured clone of the template will be returned to prevent the cached object being modified by role merges.

@param {string|object} template to be retrieved from workspace.templates if provided as string

@returns {Promise<Object|Error>} JSON Template
*/
export default async function getTemplate(template) {
  const workspace = await workspaceCache();

  if (typeof template === 'string') {
    const templateKey = String(template);
    // Protect from user provided input.
    if (/[^a-zA-Z0-9 :_-]/.exec(template)) {
      return new Error('Template key may only include whitelisted character.');
    }

    if (!Object.hasOwn(workspace.templates, template)) {
      return new Error(`Template: ${template} not found.`);
    }

    template = { ...workspace.templates[template] };
    template.key = templateKey;
  } else {
    template = { ...template };
  }

  if (!template.src) {
    return { ...template };
  }

  template.src = envReplace(template.src);

  const response = await getSource(workspace, template.src);

  if (response instanceof Error) {
    return new Error(`Unable to getFrom src: ${template.src}`);
  }

  if (template.module) {
    // Module render functions are created from the cached source string.
    return await moduleTemplate(template, response);
  }

  // Assign response to template.
  if (typeof response === 'object') {
    Object.assign(template, response);
  } else if (typeof response === 'string') {
    template.template = response;
  }

  // TODO: decide whether key should be used for scoping.
  template.key ??= template.src.match(/([^\/]+$)/)[0];

  // Prevent modification of cached template.
  return { ...template };
}

/**
@function moduleTemplate
@async

@description
The script string is converted to a JavaScript data URL which can be used in a dynamic ESM import.

The default export or the imported module itself will be assigned as the render method in the module template.

Module templates are not cached.
@param {object} template
@param {string} response Module script as string.

@returns {Promise<Object|Error>} JSON Template
*/
async function moduleTemplate(template, response) {
  try {
    const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(response)}`;

    // Use dynamic import to load the module
    const importedModule = await import(dataUrl);

    // Set the render function to the default export or the entire module
    template.render = importedModule.default || importedModule;
  } catch (err) {
    return err;
  }
  return template;
}
