/**
@module express
@description

# express.js 🚅

[Express](https://expressjs.com) is a minimal and flexible Node.js web application framework that provides a robust
set of features for web and mobile applications.

Our implementation provides the following endpoints and features:

- Rate-limited API endpoints for provider interactions
- Static file serving for documentation
- Security enhancements including header protection

The server implements the following core features:

- Rate limiting: 1000 requests per 1 min per IP
- Cookie parsing for session management
- JSON body parsing with 5MB limit for POST requests
- Static file serving with HTML extension support

## Security 🔐

- X-Powered-By header disabled
- Rate limiting enabled
- SAML authentication required for protected routes

## env

```env
PORT - Server port (default: 3000)
DIR - Base directory for routes
RATE_LIMIT - Maximum requests per window (default: 1000)
RATE_LIMIT_WINDOW - Time window in ms (default: 1 min)
```
@requires router
@requires express Web application framework
@requires cookie-parser HTTP cookie parsing middleware
@requires /utils/processEnv
*/

import createRouter from './router.js';
import './mod/utils/processEnv.js';
import express from 'express';
import validateRequestAuth from './mod/middleware/validateRequestAuth.js';
import validateRequestParams from './mod/middleware/validateRequestParams.js';

const router = createRouter([validateRequestParams, validateRequestAuth]);
const app = express();
app.use(router);

app.disable('x-powered-by');

if (!process.env.VERCEL) {
  app.listen(xyzEnv.PORT);
}

export const xyzRouter = router;
export default app;
