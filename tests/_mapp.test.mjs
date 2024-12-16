import { coreTest } from './browser/local.test.mjs';
import { mappTest } from './lib/mapp.test.mjs';
import { layerTest } from './lib/layer/_layer.test.mjs';
import { dictionaryTest } from './lib/dictionaries/_dictionaries.test.mjs';
import { locationTest } from './lib/location/_location.test.mjs';
import { mapviewTest } from './lib/mapview/_mapview.test.mjs';
import { pluginsTest } from './plugins/_plugins.test.mjs';
import { workspaceSuite } from './mod/workspace/_workspace.test.mjs';
import { templatesTest } from './mod/workspace/templates/_templates.test.mjs';
import { queryTest } from './mod/query.test.mjs';
import { userTest } from './mod/user/_user.test.js';
import { entriesTest } from './lib/ui/locations/entries/_entries.test.mjs';
import { uiTest } from './lib/_ui.test.mjs';
import { utilsTest } from './lib/utils/_utils.test.mjs';
import { formatTest } from './lib/layer/format/_format.test.mjs';
import { ui_locations } from './lib/ui/locations/_locations.test.mjs';

globalThis._mappTest = {
    coreTest,
    mappTest,
    layerTest,
    dictionaryTest,
    locationTest,
    mapviewTest,
    pluginsTest,
    workspaceSuite,
    templatesTest,
    queryTest,
    userTest,
    entriesTest,
    uiTest,
    utilsTest,
    formatTest,
    ui_locations,
}