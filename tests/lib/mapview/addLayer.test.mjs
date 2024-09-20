
/**
* This is the add layer test module for the mapview. 
 * @module lib/mapview/addLayer
*/

/**
 * The entry point test that is used to test the add layer module for a mapview. 
 * @param {Object} mapview 
 * @function addLayerTest
 */
export async function addLayerTest(mapview) {
  await codi.describe('Mapview: addLayerTest', async () => {

    /**
     * This test is used to check if we can add a single layer to the mapview.
     * @function it
     */
    await codi.it('Add single layer to mapview.', async () => {

      const layer = {
        'format': 'tiles',
        'URI': 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      }

      const layers = await mapview.addLayer(layer)

      codi.assertEqual(layers.length, 1, 'We expect to see 1 layer being returned from getLayers method.');
      codi.assertTrue(layers[0].show instanceof Function, 'The decorated layer has a show method.');
      codi.assertTrue(Object.hasOwn(mapview.layers, layers[0].key), 'The layer has been added to the mapview.');
    });

    /**
   * This test is used to check if we can add multiple layers to the mapview.
   * @function it
   */
    await codi.it('Add multiple layer to mapview.', async () => {

      const layer = {
        'format': 'tiles',
        'URI': 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      }

      const layers = await mapview.addLayer([layer, layer])

      codi.assertEqual(layers.length, 2, 'We expect to see 2 layer being returned from getLayers method.');
      codi.assertTrue(layers[0].show instanceof Function, 'The first decorated layer has a show method.');
      codi.assertTrue(Object.hasOwn(mapview.layers, layers[0].key), 'The first layer has been added to the mapview.');
    });
  });
}