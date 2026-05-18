/**
## /middleware/validateRequestAuth

@module /middleware/validateRequestAuth
*/

import { ServerResponse } from 'node:http';
import auth from '../user/auth.js';
import login from '../user/login.js';
import register from '../user/register.js';

/**
@function validateRequestAuth
@async

@description
The async validateRequestAuth will wait for the [user/auth]{@link module:/user/auth} module to return a user object.

Requests without authorization headers will be redirected to the login if the user authentication errs.

The user object will be assigned as to the req.params.

PRIVATE processes require user auth for all requests. The redirect logic will set the location header to the login page which is either defined by xyzEnv.AUTH_PATH or defaults to /api/user/login.

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

  if (req.params.logout) {
    // Remove user cookie.
    res.setHeader(
      'Set-Cookie',
      `${xyzEnv.TITLE}=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'}`,
    );

    res.setHeader('location', `${xyzEnv.DIR || '/'}`);
    res.status(302).send();
    return;
  }

  // Short circuit to user/login.
  if (req.params.login || req.body?.login) {
    login(req, res);
    return;
  }

  // Short circuit to user/register
  if (req.params.register || req.body?.register) {
    register(req, res);
    return;
  }

  // Validate signature of either request token, authorization header, or cookie.
  const user = await auth(req, res);

  // The auth module has sent a response.
  if (res.finished) return;

  // Remove token from params object.
  delete req.params.token;

  // The authentication method returns an error.
  if (user instanceof Error) {
    // Remove cookie.
    res.setHeader(
      'Set-Cookie',
      `${xyzEnv.TITLE}=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'};SameSite=Strict${(!req.headers.host.includes('localhost') && ';Secure') || ''}`,
    );

    res.status(401).send(user.message);
    return;
  }

  // Set user as request parameter.
  req.params.user = user;

  // User route
  if (req.url.match(/(?<=\/api\/user)/)) {
    //Requests to the User API maybe for login or registration and must be routed before the check for PRIVATE processes.
    next();
    return;
  }

  // PRIVATE instances require user auth for all requests.
  if (!req.params.user && xyzEnv.PRIVATE) {
    if (loginRedirect(req, res)) {
      // TODO investigate dev tool requests.
      // console.log(req.url);
      // return;
    }

    if (xyzEnv.AUTH_PATH) {
      res.setHeader('location', `${xyzEnv.DIR}${xyzEnv.AUTH_PATH}/login`);
    } else {
      res.setHeader('location', `${xyzEnv.DIR}/api/user/login`);
    }

    res.status(302).send();
    return;
  }

  next();
}

/**
@function loginRedirect

@description
The method will shortcircuit with an existing redirect `_redirect` cookie.

Otherwise the request url will decoded and assigned to a redirect cookie with a short TTL of 60 seconds.

Any existing user cookie will be removed to prevent unauthorized access with an existing cookie.

The redirect cookie is used to redirect the user back to the original requested url after a successful login.

@param {req} req HTTP request.
@param {res} res HTTP response.
*/
function loginRedirect(req, res) {
  if (req.url === `${xyzEnv.DIR}/`) {
    return;
  }

  const redirect = req.cookies?.[`${xyzEnv.TITLE}_redirect`];

  if (redirect) {
    return true;
  }

  let redirectUrl =
    req.url && decodeURIComponent(req.url).replace(/login=true/, '');

  // Remove any characters that could be used for cookie injection
  redirectUrl = redirectUrl.replaceAll(/[;\r\n]/g, '');

  // Ensure it's a relative URL (it starts with '/')
  if (!redirectUrl.startsWith('/')) {
    redirectUrl = xyzEnv.DIR || '/';
  }

  // Encode the URL for safe storage in the cookie
  const encodedRedirectUrl = encodeURIComponent(redirectUrl);

  const user_cookie = `${xyzEnv.TITLE}=null;HttpOnly;Max-Age=0;Path=${xyzEnv.DIR || '/'}`;

  const redirect_cookie = `${xyzEnv.TITLE}_redirect=${encodedRedirectUrl};HttpOnly;Max-Age=60;Path=${xyzEnv.DIR || '/'}`;

  // Set cookie with properly encoded redirect value.
  res.setHeader('Set-Cookie', [user_cookie, redirect_cookie]);
}
