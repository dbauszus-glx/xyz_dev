module.exports = _ => {

  // Get fields array from query params.
  const fields = _.fields?.split(',')
    .map(field => _.workspace.templates[field]?.template || field)
    .filter(field => !!field)

  // Push label (cluster) into fields
  _.label && field.push(_.workspace.templates[_.label]?.template || _.label)

  let
    x = parseInt(_.x),
    y = parseInt(_.y),
    z = parseInt(_.z)

  return `
    SELECT
      ST_AsMVT(tile, '${_.layer.key}', 4096, 'geom') mvt
    FROM (
      SELECT
        ${_.layer.qID || null} as id,
        ${Array.isArray(fields) ? fields.toString() + ',' : ''}
        ST_AsMVTGeom(
          ${_.geom || _.layer.geom},
          ST_TileEnvelope(${z},${x},${y}),
          4096,
          1024,
          false
        ) geom
      FROM ${_.table}
      WHERE
        ${_.layer.z_field && `${_layer.z_field} < ${z} AND` ||''}
        ST_Intersects(
          ST_TileEnvelope(${z},${x},${y}),
          ${_.geom || _.layer.geom}
        )
        \${filter}
      ) tile`
}