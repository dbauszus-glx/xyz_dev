import { registerConsoleShortcuts } from 'vitest/node';
import _user from '../user/_user.js';
import auth from '../user/auth.js';
import login from '../user/login.js';
import { setRedirect } from './redirect.js';

/**
@function validateRequestAuth
@async

@description
The async validateRequestAuth will wait for the [user/auth]{@link module:/user/auth} module to return a user object.

Requests without authorization headers will be redirected to the login if the user authentication errs.

The user object will be assigned as to the req.params.

PRIVATE processes require user auth for all requests and will shortcircuit to the user/login if the user authentication failed to resolve a user object.

@param {req} req HTTP request.
@param {res} res HTTP response.
@property {Object} req.params The request params which will be parsed by the validateRequestParams method.
@property {Object} req.headers The request headers.
@property {Object} [headers.authorization] The request carries an authorization header.
@property {string} req.url The request url.
*/
export default async function validateRequestAuth(req, res, next) {
  // Assign _params object from validateRequestParams module to req.params.
  Object.assign(req.params, req._params);

  console.log(req.url);

  if (req.params.logout) {
    // Remove cookie.
    res.setHeader(
      'Set-Cookie',
      `${xyzEnv.TITLE}=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'}`,
    );

    // Set location to the domain path.
    res.setHeader('location', `${xyzEnv.DIR || '/'}`);

    return res.status(302).send();
  }

  // Short circuit to user/login.
  if (req.params.login || req.body?.login) {
    return login(req, res);
  }

  // Short circuit to user/register
  if (req.params.register || req.body?.register) {
    return register(req, res);
  }

    // Validate signature of either request token, authorization header, or cookie.
  const user = await auth(req, res);

  // // Key authentication generates a response
  // if (user instanceof ServerResponse) {
  //   return user;
  // }

  // // Call request router if signature authentication was used.
  // if (user?.signature_auth) {
  //   next()
  //   return;
  // }

  // Remove token from params object.
  delete req.params.token;

  // The authentication method returns an error.
  if (user && user instanceof Error) {
    if (req.headers.authorization) {
      // Request with failed authorization headers are not passed to login.
      return res.status(401).send(user.message);
    }

    // Remove cookie.
    res.setHeader(
      'Set-Cookie',
      `${xyzEnv.TITLE}=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'};SameSite=Strict${(!req.headers.host.includes('localhost') && ';Secure') || ''}`,
    );

    // Set msg parameter for the login view.
    // The msg provides information in regards to failed logins.
    req.params.msg = user.msg || user.message;

    // Return login view with error message.
    return login(req, res);
  }

  // Set user as request parameter.
  req.params.user = user;
  req._params.user = user;

  const user_URLPattern = new URLPattern({
    pathname: `${xyzEnv.DIR}/api/user{/:method}`
  });

  if (user_URLPattern.test(req.url)) {
    const result = user_URLPattern.exec(req.url);
    req.params.method = result.pathname.groups.method;
    // Requests to the User API maybe for login or registration and must be routed before the check for PRIVATE processes.
    return _user(req, res);
  }

  // PRIVATE instances require user auth for all requests.
  if (!req.params.user && xyzEnv.PRIVATE) {
    // Redirect to the SAML login.
    if (xyzEnv.SAML_LOGIN) {
      // The redirect for a successful login.
      setRedirect(req, res);

      res.setHeader('location', `${xyzEnv.DIR}/saml/login`);
      return res.status(302).send();
    }

    return login(req, res);
  }

  next();
}
