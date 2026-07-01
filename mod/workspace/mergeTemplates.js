/**
## /workspace/mergeTemplates

@module /workspace/mergeTemplates
*/

import envReplace from '../utils/envReplace.js';
import merge from '../utils/merge.js';
import * as Roles from '../utils/roles.js';
import workspaceCache from './cache.js';
import getTemplate from './getTemplate.js';

let workspace;

/**
@function mergeTemplates
@async

@description

@param {Object} obj
@param {array} [roles] An array of user roles from request params.

@property {string} [obj.template] Key of template for the object.
@property {array} [obj.templates] An array of template keys to be merged into the object.
*/
export default async function mergeTemplates(obj, roles) {
  // Cache workspace in module scope for template assignment.
  workspace = await workspaceCache();

  await objTemplateComposition(obj, obj.template, roles, true);

  // This would only happen if the user does not have access to the object after it has been merged into the template [prototype].
  if (obj instanceof Error) return obj;

  // TODO the templates should be assigned after the template not if else
  if (Array.isArray(obj.templates)) {
    for (const template of obj.templates) {
      await objTemplateComposition(obj, template, roles);
    }
  }
  // // Substitute ${SRC_*} in object string.
  // obj = envReplace(obj);


  // //If the user is an admin we don't need to check roles
  // if (!Roles.check(obj, roles)) {
  //   return new Error('Role access denied.');
  // }

  return obj;
}

/**
@function objTemplate
@async

@description

@param {Object} obj
@param {Object} [template] The template maybe an object with a src property or a string.
@param {array} [roles] An array of user roles from request params.

@returns {Promise<Object>} Returns the merged obj.
*/
async function objTemplateComposition(obj, template, roles, reverse) {
  if (template === undefined) return;

  template = await getTemplate(template);

  // Failed to get template matching obj.template from template.src!
  if (template instanceof Error) {
    obj.err ??= [];
    obj.err.push(template.message);
    return obj;
  }

  template = filterProperties(obj, template);

  if (reverse) {
    // Merge obj --> template
    obj = merge(template, obj);
    parseTemplates(obj);
    return;
  }

  parseTemplates(template);

  // Merge template --> obj
  obj = merge(obj, template);
}

/**
@function filterProperties

@description
The filterProperties method will check for include_props and exclude_props properties on the obj and template.

@param {Object} obj The parent object providing include/exclude property configuration.
@param {Object} template The template to prepare.

@returns {Object} The prepared template with role overrides applied and properties filtered.
*/
function filterProperties(obj, template) {

  // TODO: should the props carried into nested templates? undefined include_props/exclude_props should not be assigned to the template object.
  template.exclude_props = obj.exclude_props ?? template.exclude_props;
  template.include_props = obj.include_props ?? template.include_props;

  if (Array.isArray(template.exclude_props)) {
    for (const prop of template.exclude_props) {
      if (template.hasOwnProperty(prop)) {
        delete template[prop];
      }
    }
  }
  if (Array.isArray(template.include_props)) {
    const _template = {};
    for (const prop of template.include_props) {
      if (template.hasOwnProperty(prop)) {
        _template[prop] = template[prop];
      }
    }
    return _template;
  }
  return template;
}

/**
@function parseTemplates

@description
The parseTemplates method will recursively traverse the provided object and its nested objects to identify and process template definitions.

If a template object is found, it will be added to the workspace.templates object for later use. The template property will be removed from the object after processing.

If an array of templates is found, each template will be merged into the object in the order they are defined in the array.

@param {Object} obj
*/
async function parseTemplates(obj) {
  // Return early if object is null or empty
  if (obj === null) return;

  if (obj instanceof Object && !Object.keys(obj)) return;

  for (const [key, val] of Object.entries(obj)) {
    if (key === 'template' && val.key) {
      // A template object provided in a template will be a query template to be merged into the workspace.templates object. The template will be assigned a _type property to identify it as a template object. Query templates are not merged into the object they are defined in but are assigned to the workspace.templates object for later use.
      val._type = 'template';
      workspace.templates[val.key] = Object.assign(
        workspace.templates[val.key] || {},
        val,
      );
      // The template is now referenced by it's key in the workspace.templates object. The template property is no longer needed on the object.
      delete obj.template;
      continue;
    }

    if (key === 'templates' && Array.isArray(val)) {
      for (const template of val) {
        // Merge template from templates array into the object. The templates will be merged in the order they are defined in the array.
        console.log(template);
        await objTemplateComposition(obj, template);
      }
      delete obj.templates;

      continue;
    }

    // Recursively process each item if we find an array
    if (Array.isArray(val)) {
      val.forEach(parseTemplates);
      continue;
    }

    // Recursively process nested objects
    if (val instanceof Object) {
      parseTemplates(val);
    }
  }
}
