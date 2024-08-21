/**
### /layer/featureFields

The featureFields module exports methods to calculate the distribution of feature field values for themes.

@module /layer/featureFields
*/

/**
@function reset

@description
featureFields.reset(layer) will reset the layer.featureFields values array for the current theme field.

@param {layer} layer A decorated mapp layer object.
*/
export function reset(layer) {

  if (!layer.params.fields) return;

  // Create featureFields object if nullish.
  layer.featureFields ??= {};

  layer.params.fields.forEach(field => {

    // Set empty values array.
    layer.featureFields[field] = {
      values: []
    };

  })
}

/**
@function process

@description
featureFields.process(layer) method will calculate the distribution of featureFields values for the current theme.

@param {layer} layer A decorated mapp layer object.
*/
export function process(layer) {

  if (layer.style.icon_scaling?.field) {

    const numbers = layer.featureFields[layer.style.icon_scaling?.field].values.map(Number).filter(n => !isNaN(n))

    layer.style.icon_scaling.maxFactor ??= Math.max(...numbers)
  }

  // Check if the distribution method is defined in the distribution object.
  if (Object.hasOwn(distribution, layer.style?.theme?.distribution)) {

    // Call the corresponding distribution function.
    distribution[layer.style.theme.distribution](layer);

    // The legend method renders into the layer.style.legend
    mapp.ui.layers.legends[layer.style.theme.type](layer)
  }
}

export const distribution = {
  jenks,
  count
}

/**
@function jenks

@description
The jenks distribution method requires the stats.jenks utility method to calculate natural breaks within the `featureFields.values[]` array.

@param {layer} layer A decorated mapp layer object.
*/
function jenks(layer) {
  let theme = layer.style.theme;

  let n = Math.min(layer.featureFields[theme.field].values.length, theme.categories.length);

  // Parse array values as float.
  layer.featureFields[theme.field].values = layer.featureFields[theme.field].values.map(parseFloat);

  // Compute Jenks natural breaks.
  layer.featureFields[theme.field].jenks =
    mapp.utils.stats.jenks(layer.featureFields[theme.field].values, n);

  let val;

  theme.categories.forEach((cat, i) => {
    val = val === layer.featureFields[theme.field].jenks[i] ? undefined : layer.featureFields[theme.field].jenks[i];
    cat.value = val;
    cat.label = val;
  });
}

/**
@function count

@description
The count distribution method counts values in the `featureFields.values[]` array.

@param {layer} layer A decorated mapp layer object.
*/
function count(layer) {
  let theme = layer.style.theme;

  layer.featureFields[theme.field].values.forEach(val => {

    // Increment count for each value.
    layer.featureFields[theme.field][val] ??= 0;
    layer.featureFields[theme.field][val]++;
  });
}

/**
@function fieldsArray

@description
The fieldsArray method checks the layer params and style to create a Set of fields which are required as feature properties.

An array without duplicates or undefined fields is returned from the Set.

@param {layer} layer A decorated mapp vector layer.
@returns {array} Array of feature fields.
*/
export function fieldsArray(layer) {

  const fieldsSet = new Set([
    layer.params.default_fields,
    Array.isArray(layer.style.theme?.fields) ?
      layer.style.theme.fields : layer.style.theme?.field,
    layer.style.theme?.field,
    layer.style.label?.field,
    layer.style.icon_scaling?.field,
    layer.cluster?.label,
  ])

  return Array.from(fieldsSet).flat().filter(field => !!field)
}
