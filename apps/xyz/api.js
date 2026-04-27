/**
## XYZ API

The XYZ API module exports the api function which serves as the entry point for all XYZ API requests.

A node.js express app will require the api module and reference the exported api method for all request routes.

```js
const app = express()
const api = require('./api/api')
app.get(`/`, api)
```

@requires /utils/processEnv
@requires /query
@requires /view
@requires /provider
@requires /sign
@requires /user
@requires /workspace
@module /api
*/

/**
@global
@typedef {Object} res
The res object represents the HTTP response that an [Express] app sends when it gets an HTTP request.
*/

/**
@global
@typedef {Object} req
The req object represents the HTTP request and has properties for the request query string, parameters, body, HTTP headers, and so on.
@property {Object} params HTTP request parameter.
@property {Object} [body] HTTP POST request body.
@property {Object} header HTTP request header.
*/

import { ServerResponse } from 'node:http';
import provider from './mod/provider/_provider.js';
import query from './mod/query.js';
import sign from './mod/sign/_sign.js';
import user from './mod/user/_user.js';
import view from './mod/view.js';
import workspace from './mod/workspace/_workspace.js';

// Group all routes
const routes = {
  provider,
  query,
  sign,
  user,
  view,
  workspace,
};

export default function api(req, res) {
  // Assign _params object from validateRequestParams module to req.params.
  Object.assign(req.params, req._params);

  requestRouter(req, res);
}

/**
@function requestRouter

@description
The requestRouter switch tests the request URL for an API case.

By default requests will be passed to the [View API]{@link module:/view} module.

@param {req} req HTTP request.
@param {res} res HTTP response.
@property {string} req.url The request url.
*/
function requestRouter(req, res) {
  switch (true) {
    // User API
    case /(?<=\/api\/user)/.test(req.url):
      routes.user(req, res);
      break;

    // Provider API
    case /(?<=\/api\/provider)/.test(req.url):
      routes.provider(req, res);
      break;

    // Signer API
    case /(?<=\/api\/sign)/.test(req.url):
      routes.sign(req, res);
      break;

    // Location API [deprecated]
    case /(?<=\/api\/location)/.test(req.url):
      // Route to Query API with location template
      req.params.template = `location_${req.params.method}`;
      routes.query(req, res);
      break;

    // Query API
    case /(?<=\/api\/query)/.test(req.url):
      routes.query(req, res);
      break;

    case /(?<=\/api\/workspace)/.test(req.url):
      routes.workspace(req, res);
      break;

    // View API is the default route.
    default:
      routes.view(req, res);
  }
}
