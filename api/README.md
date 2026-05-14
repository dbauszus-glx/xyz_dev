## XYZ API

The XYZ API are a collection of javascript modules for Node.js web application frameworks.

An example Express application script is provided in the project root.

XYZ API modules should be run with a Node.js runtime v18 or higher.

The [XYZ API](/xyz/module-_api.html) module is located in the api folder as a requirement for using the offical Node.js runtime in Vercel's Edge Network.

All other XYZ API modules are located in the /mod directory.

JSDoc is used to documented any XYZ API module, function, and their parameter.

The [clean-jsdoc-theme](https://www.npmjs.com/package/clean-jsdoc-theme) is used to build the XYZ and MAPP API reference pages which can be built and hosted local with the provided Express application script.

The XYZ API modules are:

### [Workspace](/xyz/module-_workspace)

### [View](/xyz/module-_view)

### [Query](/xyz/module-_query)

### [User](/xyz/module-_user)

### [Sign](/xyz/module-_sign)

### [Provider](/xyz/module-_provider)

Provider responses set `X-Content-Type-Options: nosniff` and only allow explicit `application/json` or `text/plain` response content types from request parameters.

JavaScript plugin modules are served as `text/javascript` when the requested provider resource URL ends in `.js` or `.mjs`. This MIME type is derived from the resource URL so plugins can be dynamically imported from any provider without allowing arbitrary request parameters to make non-JavaScript responses executable.
