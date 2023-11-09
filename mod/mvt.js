const dbs = require('./utils/dbs')()

const sqlFilter = require('./utils/sqlFilter')

const validateRequestParams = require('./utils/validateRequestParams')

const Roles = require('./utils/roles')

const logger = require('./utils/logger')

const workspaceCache = require('./workspace/cache')

const getLayer = require('./workspace/getLayer')

module.exports = async (req, res) => {

  const workspace = await workspaceCache()

  const layer = await getLayer(req.params)

  if (!layer) {
    return res.status(403).send('Layer not found.')
  }

  if (!Roles.check(layer, req.params.user?.roles)) {
    return res.status(403).send('Role access denied for layer.')
  }

  // Validate URL parameter
  if (!validateRequestParams(req.params)) {

    return res.status(400).send('URL parameter validation failed.')
  }

  if (!req.params.table) {
    return res.status(204).send(null)
  }

  let
    table = req.params.table,
    id = layer.qID || null,
    x = parseInt(req.params.x),
    y = parseInt(req.params.y),
    z = parseInt(req.params.z),
    m = 20037508.34,
    r = (m * 2) / (Math.pow(2, z))

  const roleFilter = Roles.filter(layer, req.params.user?.roles)

  const SQLparams = []

  const filter = [
    req.params.filter?
      ` AND ${sqlFilter(JSON.parse(req.params.filter), SQLparams)}`: '',
    roleFilter && Object.values(roleFilter).some(r => !!r)?
      ` AND ${sqlFilter(Object.values(roles).filter(r => !!r), SQLparams)}`: ''].join('')

  // Construct array of fields queried
  let mvt_fields = Object.values(layer.style?.themes || {})
    .map(theme => getField(theme))
    .filter(field => typeof field !== 'undefined')

  // Assign mvt_fields from single theme
  layer.style?.theme && mvt_fields.push(layer.style.theme && getField(layer.style.theme))

  mvt_fields = mvt_fields.filter(field => typeof field !== 'undefined')

  if (layer.style?.label) {

    mvt_fields.push(`${layer.style.label.field} AS label`)
  }

  function getField(theme) {

    if (theme.fieldfx) {

      console.warn('fieldfx is no longer supported for themes. please use field with a template lookup.')
    }

    if (typeof theme.fields === 'string' && theme.fields) {

      console.warn('theme fields must be an array.')
    }

    if (Array.isArray(theme.fields)) {

      return theme.fields.map(field => `${workspace.templates[field]?.template || field} AS ${field}`).join(', ')
    }

    if (!theme.field) return;

    return `${workspace.templates[theme.field]?.template || theme.field} AS ${theme.field}`
  }

  const geoms = layer.geoms && Object.keys(layer.geoms)

  let geom = geoms && layer.geoms[z] || layer.geom

  geom = geoms && z < parseInt(geoms[0]) && Object.values(layer.geoms)[0] || geom
  
  geom = geoms && z > parseInt(geoms[geoms.length -1]) && Object.values(layer.geoms)[geoms.length -1]  || geom

  if (!geom) {
    return res.status(204).send(null)
  }

  const tile = `
    SELECT
      ${z},
      ${x},
      ${y},
      ST_AsMVT(tile, '${layer.key}', 4096, 'geom') mvt,
      ST_MakeEnvelope(
        ${-m + (x * r)},
        ${ m - (y * r) - r},
        ${-m + (x * r) + r},
        ${ m - (y * r)},
        3857
      ) tile
    FROM (
      SELECT
        ${id} as id,
        ${mvt_fields.length && mvt_fields.toString() + ',' || ''}
        ST_AsMVTGeom(
          ${layer.srid !== '3857' && `ST_Transform(` ||''}
            ${geom},
          ${layer.srid !== '3857' && `${layer.srid}), ST_Transform(` ||''}
            ST_MakeEnvelope(
              ${-m + (x * r)},
              ${ m - (y * r) - r},
              ${-m + (x * r) + r},
              ${ m - (y * r)},
              3857
            ),
          ${layer.srid !== '3857' && `${layer.srid}),` ||''}
          4096,
          1024,
          false
        ) geom
      FROM ${table}
      WHERE
        ${layer.z_field && `${layer.z_field} < ${z} AND` ||''}
        ST_Intersects(
          ${layer.srid !== '3857' && `ST_Transform(` ||''}
            ST_MakeEnvelope(
              ${-m + (x * r) - (r/4)},
              ${ m - (y * r) - r - (r/4)},
              ${-m + (x * r) + r + (r/4)},
              ${ m - (y * r) + (r/4)},
              3857
            ),
          ${layer.srid !== '3857' && `${layer.srid}),` ||''}
          ${geom}
        ) ${filter}
      ) tile`

  if ((!filter || filter === '') && layer.mvt_cache) {

    // Validate dynamic method call.
    if (!Object.hasOwn(dbs, layer.dbs || workspace.dbs) || typeof dbs[layer.dbs || workspace.dbs] !== 'function') return;    

    let rows = await dbs[layer.dbs || workspace.dbs](`SELECT mvt FROM ${layer.mvt_cache} WHERE z = ${z} AND x = ${x} AND y = ${y}`)

    if (rows instanceof Error) console.log('failed to query mvt cache')

    if(!rows.length) {

      // Validate dynamic method call.
      if (typeof dbs[layer.dbs || workspace.dbs] !== 'function') return;

      rows = await dbs[layer.dbs || workspace.dbs](`
        WITH n AS (
          INSERT INTO ${layer.mvt_cache}
          ${tile} ON CONFLICT (z, x, y) DO NOTHING RETURNING mvt
        ) SELECT mvt FROM n;`)

      if (rows instanceof Error) console.log('failed to cache mvt')
    }
    
    // If found return the cached MVT to client.
    if (rows.length === 1)  return res.send(rows[0].mvt)
  }

  // Validate dynamic method call.
  if (typeof dbs[layer.dbs || workspace.dbs] !== 'function') return;  

  let rows = await dbs[layer.dbs || workspace.dbs](tile, SQLparams)

  if (rows instanceof Error) return res.status(500).send('Failed to query PostGIS table.')

  logger(`Get tile ${z}/${x}/${y}`, 'mvt')

  res.send(rows[0].mvt)
}