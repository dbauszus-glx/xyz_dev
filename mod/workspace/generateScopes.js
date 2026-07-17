/**
## /workspace/generateScopes

Composes every locale, layer, and nested locale in a workspace to collect the
complete list of template scopes.

@module /workspace/generateScopes
*/

import getLocale from './getLocale.js';

/**
@function generateScopes
@async

@param {Object} workspace Cached workspace receiving scopes from composeObj.
@returns {Promise<Array<String>>} Sorted, unique scope strings.
*/
export default async function generateScopes(workspace) {
  // TODO test workspace without locales property. Should the scopes method still return the scopes of the templates in the workspace.templates object?
  for (const localeKey of Object.keys(workspace.locales)) {
    const locale = await getLocale({
      locale: localeKey,
      layers: true,
      user: { roles: true },
    });
    await nestedLocales(locale, { roles: true });
  }

  const scopeStrings = new Set();

  workspace.scopes.forEach((scope) => {
    if (!Array.isArray(scope)) return;
    scopeStrings.add(scope.filter(Boolean).join('.'));
  });

  return Array.from(scopeStrings)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function nestedLocales(locale, user) {
  if (!Array.isArray(locale.locales)) return;

  const keys = locale.keys ?? [locale.key];
  for (const localeKey of locale.locales) {
    const nestedLocale = await getLocale({
      locale: [...keys, localeKey],
      layers: true,
      user,
    });

    await nestedLocales(nestedLocale, user);
  }
}
