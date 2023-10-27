const clone = require('../utils/clone.js')

const Roles = require('../utils/roles.js')

const _getLayer = require('./getLayer')

const workspaceCache = require('./cache')

let workspace;

module.exports = async (req, res) => {

  workspace = await workspaceCache()

  const keys = {
    layer: getLayer,
    locale: getLocale,
    locales: getLocales,
    roles: getRoles,
  }

  // The keys object must own a user provided lookup key
  if (!Object.hasOwn(keys, req.params.key)) {

    return res.send(`
      Failed to evaluate 'key' param.<br><br>
      <a href="https://github.com/GEOLYTIX/xyz/wiki/XYZ---API#workspacekey">Workspace API</a>`)
  }

  return keys[req.params.key](req, res)
}

async function getLayer(req, res) {

  if (!Object.hasOwn(workspace.locales, req.params.locale)) {
    return res.status(400).send(`Unable to validate locale param.`)
  }

  const locale = workspace.locales[req.params.locale]

  const roles = req.params.user?.roles || []

  if (!Roles.check(locale, roles)) {
    return res.status(403).send('Role access denied.')
  }

  if (!Object.hasOwn(locale.layers, req.params.layer)) {
    return res.status(400).send(`Unable to validate layer param.`)
  }

  const layer = await _getLayer(req)

  if (!Roles.check(layer, roles)) {
    return res.status(403).send('Role access denied.')
  }

  res.json(layer)
}

function getLocales(req, res) {

  const roles = req.params.user?.roles || []

  const locales = Object.values(workspace.locales)
    .filter(locale => !!Roles.check(locale, roles))
    .map(locale => ({
      key: locale.key,
      name: locale.name
    }))

  res.send(locales)
}

function getLocale(req, res) {

  if (req.params.locale && !Object.hasOwn(workspace.locales, req.params.locale)) {
    return res.status(400).send(`Unable to validate locale param.`)
  }

  let locale = {};

  if (Object.hasOwn(workspace.locales, req.params.locale)) {

    locale = clone(workspace.locales?.[req.params.locale])

  } else if (typeof workspace.locale === 'object') {

    locale = clone(workspace.locale)
  }
  
  const roles = req.params.user?.roles || []

  if (!Roles.check(locale, roles)) {
    return res.status(403).send('Role access denied.')
  }

  // Check layer access.
  locale.layers = locale.layers && Object.entries(locale.layers)
    .filter(layer => !!Roles.check(layer[1], roles))
    .map(layer => layer[0])

  res.json(locale)
}

function getRoles(req, res) {

  if (!workspace.locales) return res.send({})

  let roles = Roles.get(workspace)

  res.send(roles)
}